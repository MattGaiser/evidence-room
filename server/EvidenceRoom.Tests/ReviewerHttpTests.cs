using System.Net;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace EvidenceRoom.Tests;

public sealed class ReviewerHttpTests
{
    private static RuntimeSettings Settings(bool hosted) => RuntimeSettings.FromEnvironment(name => name switch
    {
        "K_SERVICE" => hosted ? "test" : null,
        "PUBLIC_ORIGINS" => "https://demo.example,https://service.run.app",
        "EVIDENCE_SNAPSHOT_BUCKET" => "private-bucket",
        _ => null
    });

    private sealed class TestLogger : ILogger<ReviewerHttpMiddleware>
    {
        public List<string> Messages { get; } = [];
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel level) => true;
        public void Log<TState>(LogLevel level, EventId id, TState state, Exception? error, Func<TState, Exception?, string> format) => Messages.Add(format(state, error));
    }

    [Theory]
    [InlineData("https://demo.example", "service.run.app", "application/json", 204)]
    [InlineData("https://foreign.invalid", "service.run.app", "application/json", 403)]
    [InlineData(null, "service.run.app", "application/json", 403)]
    [InlineData("https://demo.example", "foreign.invalid", "application/json", 403)]
    [InlineData("https://demo.example", "service.run.app", "text/plain", 415)]
    public async Task HostedWritesRequireConfiguredHostAndOrigin(string? origin, string host, string contentType, int expected)
    {
        using var services = new ServiceCollection().BuildServiceProvider();
        var context = new DefaultHttpContext { RequestServices = services };
        context.Request.Path = "/api/entries";
        context.Request.Method = "POST";
        context.Request.Host = new HostString(host);
        context.Request.ContentType = contentType;
        if (origin is not null) context.Request.Headers.Origin = origin;
        context.Request.Headers["X-Forwarded-Host"] = "service.run.app";
        context.Response.Body = new MemoryStream();
        var invoked = false;
        var middleware = new ReviewerHttpMiddleware(_ => { invoked = true; context.Response.StatusCode = 204; return Task.CompletedTask; }, new TestLogger(), Settings(true), () => true);
        await middleware.InvokeAsync(context);
        Assert.Equal(expected, context.Response.StatusCode);
        Assert.Equal(expected == 204, invoked);
        Assert.Equal("no-store", context.Response.Headers.CacheControl);
        Assert.Equal(ReviewerHttpMiddleware.ContentSecurityPolicy, context.Response.Headers.ContentSecurityPolicy);
    }

    [Fact]
    public async Task LocalHostHeaderCannotTurnARemoteClientIntoALocalClient()
    {
        using var services = new ServiceCollection().BuildServiceProvider();
        var context = new DefaultHttpContext { RequestServices = services };
        context.Request.Host = new HostString("localhost");
        context.Connection.RemoteIpAddress = IPAddress.Parse("203.0.113.10");
        context.Request.Headers["X-Forwarded-For"] = "127.0.0.1";
        context.Response.Body = new MemoryStream();
        await new ReviewerHttpMiddleware(_ => throw new InvalidOperationException("Must not reach the API."), new TestLogger(), Settings(false), () => true).InvokeAsync(context);
        Assert.Equal(403, context.Response.StatusCode);
    }

    [Fact]
    public async Task UnhealthyProbeBypassesHostPolicyWithoutReadingWorkspaceState()
    {
        var context = new DefaultHttpContext();
        context.Request.Path = "/health";
        context.Response.Body = new MemoryStream();
        await new ReviewerHttpMiddleware(_ => throw new InvalidOperationException("Must not reach the API."), new TestLogger(), Settings(true), () => false).InvokeAsync(context);
        Assert.Equal(503, context.Response.StatusCode);
        Assert.Equal("no-store", context.Response.Headers.CacheControl);
    }

    [Fact]
    public async Task PersistenceDiagnosticsRetainCauseAndStatusWithoutLeakingItsContent()
    {
        using var services = new ServiceCollection().BuildServiceProvider();
        var context = new DefaultHttpContext { RequestServices = services };
        context.Request.Host = new HostString("service.run.app");
        context.Request.Path = "/api/workspace";
        context.Request.Method = "GET";
        context.Response.Body = new MemoryStream();
        var log = new TestLogger();
        var cause = new HttpRequestException("private-response-content", null, HttpStatusCode.Forbidden);
        await new ReviewerHttpMiddleware(_ => throw new DomainError(503, "Storage reconnecting.", cause, "persist-workspace"), log, Settings(true), () => true).InvokeAsync(context);
        Assert.Equal(503, context.Response.StatusCode);
        var message = Assert.Single(log.Messages);
        Assert.Contains("persist-workspace", message);
        Assert.Contains("HttpRequestException", message);
        Assert.Contains("Forbidden", message);
        Assert.DoesNotContain(cause.Message, message);
        context.Response.Body.Position = 0;
        Assert.DoesNotContain(cause.Message, await new StreamReader(context.Response.Body).ReadToEndAsync());
    }
}
