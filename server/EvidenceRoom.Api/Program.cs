using EvidenceRoom;
using Microsoft.Extensions.FileProviders;

var settings = RuntimeSettings.FromEnvironment();
var root = settings.Root;
var competition = Wire.Read<Competition>(File.ReadAllText(Path.Combine(root, "data", "competition.json")));
using var cloudHttp = new HttpClient { Timeout = TimeSpan.FromSeconds(8), MaxResponseContentBufferSize = WorkspaceSnapshot.MaximumBytes + 8192 };
WorkspaceSnapshot? snapshot = null;
var path = settings.DatabasePath;
if (settings.Hosted)
{
    path = Path.Combine(Path.GetTempPath(), "evidence-room-" + Guid.NewGuid().ToString("N"), "workspace.sqlite");
    snapshot = new WorkspaceSnapshot(path, new CloudSnapshotStorage(settings.SnapshotBucket!, cloudHttp));
}
var store = new Store(path, competition, snapshot);
var worker = new ReviewWorker(settings, store);
var builder = WebApplication.CreateBuilder(args);
if (settings.Hosted) builder.WebHost.UseUrls("http://0.0.0.0:" + settings.Port);
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 65536);
builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.UnmappedMemberHandling = System.Text.Json.Serialization.JsonUnmappedMemberHandling.Disallow);
var app = builder.Build();
app.UseMiddleware<ReviewerHttpMiddleware>(settings, (Func<bool>)(() => snapshot?.Healthy != false));
app.MapGet("/api/workspace", () => Results.Ok(new { competition = new { competition.Id, competition.Name, competition.Round, competition.Version, competition.Brief, competition.Criteria }, entries = store.List(), sharedDemo = settings.Hosted, ai = new { available = worker.Available, remaining = Math.Max(0, worker.Limit - store.Attempts()) } }));
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
