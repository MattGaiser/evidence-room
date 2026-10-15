using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;

namespace EvidenceRoom;

public sealed class CloudSnapshotStorage(string bucket, HttpClient http) : ISnapshotStorage
{
    private readonly string objectUrl = $"https://storage.googleapis.com/storage/v1/b/{Uri.EscapeDataString(bucket)}/o/workspace.sqlite";
    private string? token;
    private DateTimeOffset expires;

    private HttpResponseMessage Send(HttpRequestMessage request)
    {
        if (token is null || expires <= DateTimeOffset.UtcNow)
        {
            using var identity = new HttpRequestMessage(HttpMethod.Get, "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token");
            identity.Headers.Add("Metadata-Flavor", "Google");
            using var response = http.Send(identity);
            response.EnsureSuccessStatusCode();
            using var body = JsonDocument.Parse(response.Content.ReadAsStream());
            token = body.RootElement.GetProperty("access_token").GetString();
            if (string.IsNullOrWhiteSpace(token)) throw new InvalidDataException("Runtime identity did not supply a token.");
            expires = DateTimeOffset.UtcNow.AddSeconds(Math.Max(0, body.RootElement.GetProperty("expires_in").GetInt32() - 60));
        }
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return http.Send(request);
    }

    public StoredSnapshot? Download()
    {
        using var metadataRequest = new HttpRequestMessage(HttpMethod.Get, objectUrl + "?fields=generation,size");
        using var metadata = Send(metadataRequest);
        if (metadata.StatusCode == HttpStatusCode.NotFound) return null;
        metadata.EnsureSuccessStatusCode();
        using var body = JsonDocument.Parse(metadata.Content.ReadAsStream());
        var generation = body.RootElement.GetProperty("generation").GetString();
        if (string.IsNullOrEmpty(generation) || !generation.All(char.IsAsciiDigit)) throw new InvalidDataException("Invalid workspace generation.");
        if (!long.TryParse(body.RootElement.GetProperty("size").GetString(), out var size) || size < 0 || size > WorkspaceSnapshot.MaximumBytes)
            throw new InvalidDataException("Invalid workspace size.");
        using var downloadRequest = new HttpRequestMessage(HttpMethod.Get, objectUrl + "?alt=media&generation=" + generation);
        using var download = Send(downloadRequest);
        download.EnsureSuccessStatusCode();
        using var stream = download.Content.ReadAsStream();
        using var content = new MemoryStream();
        var buffer = new byte[8192];
        int count;
        while ((count = stream.Read(buffer)) > 0)
        {
            if (content.Length + count > WorkspaceSnapshot.MaximumBytes) throw new InvalidDataException("Workspace download exceeded its size limit.");
            content.Write(buffer, 0, count);
        }
        return new StoredSnapshot(content.ToArray(), generation);
    }

    public string Upload(byte[] content, string expectedGeneration)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, $"https://storage.googleapis.com/upload/storage/v1/b/{Uri.EscapeDataString(bucket)}/o?uploadType=media&name=workspace.sqlite&ifGenerationMatch={expectedGeneration}");
        request.Content = new ByteArrayContent(content);
        request.Content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        using var response = Send(request);
        response.EnsureSuccessStatusCode(); // A generation conflict never retries a stale snapshot.
        using var body = JsonDocument.Parse(response.Content.ReadAsStream());
        var generation = body.RootElement.GetProperty("generation").GetString();
        if (string.IsNullOrEmpty(generation) || !generation.All(char.IsAsciiDigit)) throw new InvalidDataException("Invalid saved workspace generation.");
        return generation;
    }
}
