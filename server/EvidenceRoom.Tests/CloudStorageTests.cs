using System.Net;

namespace EvidenceRoom.Tests;

public sealed class CloudStorageTests
{
    private sealed class Handler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        protected override HttpResponseMessage Send(HttpRequestMessage request, CancellationToken cancellationToken) => respond(request);
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => Task.FromResult(respond(request));
    }
    private static HttpResponseMessage Json(string body, HttpStatusCode status = HttpStatusCode.OK) => new(status) { Content = new StringContent(body) };
    private static bool Identity(HttpRequestMessage request) => request.RequestUri!.Host == "metadata.google.internal";

    [Theory]
    [InlineData(HttpStatusCode.Forbidden)]
    [InlineData(HttpStatusCode.ServiceUnavailable)]
    public void StorageFailuresNeverBecomeMissingSnapshots(HttpStatusCode status)
    {
        using var client = new HttpClient(new Handler(request => Identity(request)
            ? Json("{\"access_token\":\"test-only\",\"expires_in\":3600}")
            : Json("{}", status)));
        Assert.Throws<HttpRequestException>(() => new CloudSnapshotStorage("test-bucket", client).Download());
    }

    [Fact]
    public void DownloadPinsTheExactGenerationAndOnly404MeansNewWorkspace()
    {
        var calls = new List<string>();
        using var client = new HttpClient(new Handler(request =>
        {
            calls.Add(request.RequestUri!.AbsoluteUri);
            if (Identity(request)) return Json("{\"access_token\":\"test-only\",\"expires_in\":3600}");
            Assert.Equal("Bearer", request.Headers.Authorization?.Scheme);
            return request.RequestUri.Query.Contains("alt=media")
                ? new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent([1, 2, 3]) }
                : Json("{\"generation\":\"27\",\"size\":\"3\"}");
        }));
        var snapshot = new CloudSnapshotStorage("test-bucket", client).Download();
        Assert.Equal("27", snapshot?.Generation);
        Assert.Equal(new byte[] { 1, 2, 3 }, snapshot?.Content);
        Assert.Contains(calls, uri => uri.EndsWith("?alt=media&generation=27", StringComparison.Ordinal));
        using var empty = new HttpClient(new Handler(request => Identity(request)
            ? Json("{\"access_token\":\"test-only\",\"expires_in\":3600}") : Json("{}", HttpStatusCode.NotFound)));
        Assert.Null(new CloudSnapshotStorage("test-bucket", empty).Download());
    }

    [Theory]
    [InlineData("0")]
    [InlineData("27")]
    public void ConditionalUploadNeverRetriesAConflictingGeneration(string generation)
    {
        var uploads = 0;
        using var client = new HttpClient(new Handler(request =>
        {
            if (Identity(request)) return Json("{\"access_token\":\"test-only\",\"expires_in\":3600}");
            uploads++;
            Assert.Equal(HttpMethod.Post, request.Method);
            Assert.EndsWith("&ifGenerationMatch=" + generation, request.RequestUri!.Query);
            return Json("{}", HttpStatusCode.PreconditionFailed);
        }));
        Assert.Throws<HttpRequestException>(() => new CloudSnapshotStorage("test-bucket", client).Upload([1, 2, 3], generation));
        Assert.Equal(1, uploads);
    }
}
