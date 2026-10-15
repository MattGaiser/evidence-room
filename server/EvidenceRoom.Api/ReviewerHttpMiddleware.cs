using System.Net;

namespace EvidenceRoom;

public sealed class ReviewerHttpMiddleware(
    RequestDelegate next,
    ILogger<ReviewerHttpMiddleware> logger,
    RuntimeSettings settings,
    Func<bool> healthy)
{
    public const string ContentSecurityPolicy = "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
    private readonly HashSet<string> allowedHosts = settings.PublicOrigins.Select(origin => new Uri(origin).Host).ToHashSet(StringComparer.OrdinalIgnoreCase);

    public async Task InvokeAsync(HttpContext context)
    {
        context.Response.Headers["X-Content-Type-Options"] = "nosniff";
        context.Response.Headers["Referrer-Policy"] = "no-referrer";
        context.Response.Headers["Content-Security-Policy"] = ContentSecurityPolicy;
        var api = context.Request.Path.StartsWithSegments("/api");
        if (api || context.Request.Path == "/health") context.Response.Headers.CacheControl = "no-store";
        if (context.Request.Path == "/health")
        {
            var ready = healthy();
            context.Response.StatusCode = ready ? 200 : 503;
            await context.Response.WriteAsync(ready ? "ready" : "reconnecting");
            return;
        }
        if (!AllowsHost(context))
        {
            await Error(context, 403, settings.Hosted
                ? "The request host is not configured for this workspace."
                : "This reviewer workspace accepts local connections only.");
            return;
        }
        if (api && !HttpMethods.IsGet(context.Request.Method) && !HttpMethods.IsHead(context.Request.Method))
        {
            var origin = context.Request.Headers.Origin.ToString();
            var allowed = settings.Hosted ? settings.PublicOrigins.Contains(origin)
                : origin == "" || origin == $"{context.Request.Scheme}://{context.Request.Host}" || origin == "http://127.0.0.1:5193";
            if (!allowed) { await Error(context, 403, "Use the reviewer workspace to make changes."); return; }
            if (!context.Request.HasJsonContentType()) { await Error(context, 415, "Send application/json."); return; }
        }
        try { await next(context); }
        catch (DomainError error)
        {
            if (error.InnerException is { } cause)
                logger.LogError("Workspace operation {Operation} failed: {FailureType}; HTTP status {HttpStatus}",
                    error.Operation ?? "request", cause.GetType().Name, (cause as HttpRequestException)?.StatusCode);
            await Error(context, error.Status, error.Message);
        }
        catch (BadHttpRequestException) { await Error(context, 400, "The request could not be read. Check the fields and try again."); }
        catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested) { }
        catch (Exception error)
        {
            logger.LogError("Request failed: {ErrorType}", error.GetType().Name);
            await Error(context, 500, "The operation could not be completed. Your unsaved text is still available; try again.");
        }
    }

    private bool AllowsHost(HttpContext context)
    {
        if (settings.Hosted) return allowedHosts.Contains(context.Request.Host.Host);
        return (context.Request.Host.Host is "127.0.0.1" or "localhost" or "[::1]") &&
            (context.Connection.RemoteIpAddress is not { } address || IPAddress.IsLoopback(address));
    }

    private static Task Error(HttpContext context, int status, string message)
    {
        context.Response.StatusCode = status;
        return context.Response.WriteAsJsonAsync(new { error = message });
    }
}
