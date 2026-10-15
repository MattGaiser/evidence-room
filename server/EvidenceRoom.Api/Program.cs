using System.Net;
using System.Text.Json;
using EvidenceRoom;
using Microsoft.Extensions.FileProviders;

var root = Environment.GetEnvironmentVariable("EVIDENCE_ROOT") ?? Directory.GetCurrentDirectory();
var competition = Wire.Read<Competition>(File.ReadAllText(Path.Combine(root, "data", "competition.json")));
var hosted = !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("K_SERVICE"));
var origins = (Environment.GetEnvironmentVariable("PUBLIC_ORIGINS") ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
if (hosted && (origins.Length == 0 || origins.Any(origin => !Uri.TryCreate(origin, UriKind.Absolute, out var uri) || uri.Scheme != "https" || uri.GetLeftPart(UriPartial.Authority) != origin)))
    throw new InvalidOperationException("Hosted execution requires exact HTTPS PUBLIC_ORIGINS.");
var allowedHosts = origins.Select(origin => new Uri(origin).Host).ToHashSet(StringComparer.OrdinalIgnoreCase);
WorkspaceSnapshot? snapshot = null;
var path = Environment.GetEnvironmentVariable("EVIDENCE_DB") ?? Path.Combine(root, ".local", "evidence.sqlite");
if (hosted)
{
    var bucket = Environment.GetEnvironmentVariable("EVIDENCE_SNAPSHOT_BUCKET");
    if (string.IsNullOrWhiteSpace(bucket)) throw new InvalidOperationException("Hosted execution requires a private snapshot bucket.");
    path = Path.Combine(Path.GetTempPath(), "evidence-room-" + Guid.NewGuid().ToString("N"), "workspace.sqlite");
    snapshot = new WorkspaceSnapshot(path, new CloudSnapshotStorage(bucket, new HttpClient { Timeout = TimeSpan.FromSeconds(8), MaxResponseContentBufferSize = WorkspaceSnapshot.MaximumBytes + 8192 }));
}
var store = new Store(path, competition, snapshot);
var worker = new ReviewWorker(root, store);
var builder = WebApplication.CreateBuilder(args);
if (hosted) builder.WebHost.UseUrls("http://0.0.0.0:" + (Environment.GetEnvironmentVariable("PORT") ?? "8080"));
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 65536);
builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.UnmappedMemberHandling = System.Text.Json.Serialization.JsonUnmappedMemberHandling.Disallow);
var app = builder.Build();
app.Use(async (context, next) =>
{
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["Referrer-Policy"] = "no-referrer";
    context.Response.Headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
    if (context.Request.Path == "/health")
    {
        context.Response.StatusCode = snapshot?.Healthy != false ? 200 : 503;
        await context.Response.WriteAsync(snapshot?.Healthy != false ? "ready" : "reconnecting");
        return;
    }
    var host = context.Request.Host.Host;
    if (hosted ? !allowedHosts.Contains(host) : host is not ("127.0.0.1" or "localhost" or "[::1]") || (context.Connection.RemoteIpAddress is { } address && !IPAddress.IsLoopback(address)))
    { context.Response.StatusCode = 403; await context.Response.WriteAsJsonAsync(new { error = "This reviewer workspace accepts local connections only." }); return; }
    if (context.Request.Path.StartsWithSegments("/api"))
    {
        context.Response.Headers.CacheControl = "no-store";
        if (!HttpMethods.IsGet(context.Request.Method) && !HttpMethods.IsHead(context.Request.Method))
        {
            var origin = context.Request.Headers.Origin.ToString();
            var allowed = $"{context.Request.Scheme}://{context.Request.Host}";
            if (hosted ? !origins.Contains(origin, StringComparer.Ordinal) : origin != "" && origin != allowed && origin != "http://127.0.0.1:5193")
            { context.Response.StatusCode = 403; await context.Response.WriteAsJsonAsync(new { error = "Use the reviewer workspace to make changes." }); return; }
            if (!context.Request.HasJsonContentType())
            { context.Response.StatusCode = 415; await context.Response.WriteAsJsonAsync(new { error = "Send application/json." }); return; }
        }
    }
    try { await next(); }
    catch (DomainError error) { context.Response.StatusCode = error.Status; await context.Response.WriteAsJsonAsync(new { error = error.Message }); }
    catch (BadHttpRequestException) { context.Response.StatusCode = 400; await context.Response.WriteAsJsonAsync(new { error = "The request could not be read. Check the fields and try again." }); }
    catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested) { }
    catch (Exception error)
    {
        app.Logger.LogError("Request failed: {ErrorType}", error.GetType().Name);
        context.Response.StatusCode = 500; await context.Response.WriteAsJsonAsync(new { error = "The operation could not be completed. Your unsaved text is still available; try again." });
    }
});
app.MapGet("/api/workspace", () => Results.Ok(new { competition = new { competition.Id, competition.Name, competition.Round, competition.Version, competition.Brief, competition.Criteria }, entries = store.List(), sharedDemo = hosted, ai = new { available = worker.Available, remaining = Math.Max(0, worker.Limit - store.Attempts()) } }));
app.MapGet("/api/entries/{id}", (string id) => Results.Ok(store.Get(id)));
app.MapPost("/api/entries", (EntryInput input) => Results.Ok(store.Create(input)));
app.MapPut("/api/entries/{id}", (string id, EntryInput input) => Results.Ok(store.Revise(id, input)));
app.MapPost("/api/entries/{id}/analysis", async (string id, ReviewInput input, CancellationToken cancel) => Results.Ok(await worker.Run(id, input.ExpectedRevision, cancel)));
app.MapPut("/api/entries/{id}/assessment", (string id, AssessmentInput input) => Results.Ok(store.SaveAssessment(id, input)));
app.MapGet("/api/entries/{id}/export", (string id) => Results.File(System.Text.Encoding.UTF8.GetBytes(Wire.Pack(store.Export(id))), "application/json", $"evidence-room-{id}.json"));
app.Map("/api/{**rest}", () => Results.NotFound(new { error = "That API route does not exist." }));
var dist = Path.Combine(root, "dist");
if (Directory.Exists(dist))
{
    app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = new PhysicalFileProvider(dist) });
    app.UseStaticFiles(new StaticFileOptions { FileProvider = new PhysicalFileProvider(dist) });
    app.MapFallback(async context => { context.Response.ContentType = "text/html"; await context.Response.SendFileAsync(Path.Combine(dist, "index.html")); });
}
app.Run();

public partial class Program;
