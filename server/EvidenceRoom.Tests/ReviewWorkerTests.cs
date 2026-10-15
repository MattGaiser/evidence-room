using System.Diagnostics;
using System.Text.Json.Nodes;
using Microsoft.Data.Sqlite;

namespace EvidenceRoom.Tests;

[Collection("SQLite workspace")]
public sealed class ReviewWorkerTests : IDisposable
{
    private readonly string directory = Path.Combine(Path.GetTempPath(), "evidence-worker-" + Guid.NewGuid().ToString("N"));
    private readonly Competition competition = Wire.Read<Competition>(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "competition.json")));
    private readonly List<Process> children = [];
    private Store store = null!;

    private ReviewWorker Worker(TimeSpan? timeout = null, Func<Process, bool>? stop = null)
    {
        Directory.CreateDirectory(Path.Combine(directory, "worker"));
        store = new Store(Path.Combine(directory, "test.sqlite"), competition);
        File.WriteAllText(Path.Combine(directory, "result.json"), Wire.Pack(new
        {
            content = competition.Submissions[0].ExampleReview,
            model = "local-contract-fixture",
            promptVersion = Rules.PromptVersion
        }));
        var settings = RuntimeSettings.FromEnvironment(name => name switch
        {
            "EVIDENCE_ROOT" => directory,
            "OPENAI_API_KEY" => "test-only",
            "PYTHON_EXECUTABLE" => Environment.GetEnvironmentVariable(name),
            _ => null
        });
        return new ReviewWorker(settings, store, timeout ?? TimeSpan.FromSeconds(10), stop);
    }

    private void Script(string body) => File.WriteAllText(Path.Combine(directory, "worker", "review.py"),
        "import os, pathlib, sys, time\npathlib.Path('child.pid.tmp').write_text(str(os.getpid()))\nos.replace('child.pid.tmp', 'child.pid')\n" + body);

    private void SuccessfulScript() => Script("sys.stdin.buffer.read()\nprint(pathlib.Path('result.json').read_text())\n");

    private async Task<Process> RunningChild()
    {
        var marker = Path.Combine(directory, "child.pid");
        using var wait = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        while (!File.Exists(marker) || store.Attempts() == 0) await Task.Delay(20, wait.Token);
        var child = Process.GetProcessById(int.Parse(File.ReadAllText(marker)));
        children.Add(child);
        return child;
    }

    [Fact]
    public async Task DeadlineKillsRealChildAndPreservesReviewAndReservation()
    {
        var worker = Worker(TimeSpan.FromSeconds(3));
        Script("sys.stdin.buffer.read()\ntime.sleep(60)\n");
        var before = Wire.Pack(store.Get("tidewell"));
        var running = worker.Run("tidewell", 1, CancellationToken.None);
        var child = await RunningChild();
        var error = await Assert.ThrowsAsync<DomainError>(() => running);
        Assert.Equal(504, error.Status);
        Assert.True(child.HasExited);
        Assert.True(worker.Healthy);
        Assert.Equal(1, store.Attempts());
        Assert.Equal(before, Wire.Pack(store.Get("tidewell")));
        SuccessfulScript();
        Assert.Equal("openai", (await worker.Run("tidewell", 1, CancellationToken.None)).Review?.Source);
    }

    [Fact]
    public async Task CancellationStopsChildRejectsOverlapAndReleasesGateAfterExit()
    {
        var worker = Worker();
        Script("sys.stdin.buffer.read()\ntime.sleep(60)\n");
        var before = Wire.Pack(store.Get("tidewell"));
        using var cancel = new CancellationTokenSource();
        var running = worker.Run("tidewell", 1, cancel.Token);
        var child = await RunningChild();
        Assert.Equal(429, (await Assert.ThrowsAsync<DomainError>(() => worker.Run("tidewell", 1, CancellationToken.None))).Status);
        Assert.Equal(1, store.Attempts());
        cancel.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => running);
        Assert.True(child.HasExited);
        Assert.Equal(before, Wire.Pack(store.Get("tidewell")));
        SuccessfulScript();
        await worker.Run("tidewell", 1, CancellationToken.None);
        Assert.Equal(2, store.Attempts());
    }

    [Fact]
    public async Task UnexpectedProcessExitIs502AndDoesNotBlockFollowingAnalysis()
    {
        var worker = Worker();
        Script("sys.exit(7)\n");
        var before = Wire.Pack(store.Get("tidewell"));
        Assert.Equal(502, (await Assert.ThrowsAsync<DomainError>(() => worker.Run("tidewell", 1, CancellationToken.None))).Status);
        Assert.Equal(before, Wire.Pack(store.Get("tidewell")));
        SuccessfulScript();
        await worker.Run("tidewell", 1, CancellationToken.None);
        Assert.True(worker.Healthy);
    }

    [Fact]
    public async Task UnconfirmedShutdownDisablesWorkerBeforeGateCanBeReused()
    {
        var worker = Worker(stop: _ => false);
        Script("sys.stdin.buffer.read()\ntime.sleep(60)\n");
        using var cancel = new CancellationTokenSource();
        var running = worker.Run("tidewell", 1, cancel.Token);
        var child = await RunningChild();
        cancel.Cancel();
        Assert.Equal(503, (await Assert.ThrowsAsync<DomainError>(() => running)).Status);
        Assert.False(worker.Healthy);
        Assert.False(worker.Available);
        Assert.False(child.HasExited);
        Assert.Equal(503, (await Assert.ThrowsAsync<DomainError>(() => worker.Run("tidewell", 1, CancellationToken.None))).Status);
        Assert.Equal(1, store.Attempts());
    }

    [Theory]
    [InlineData("valid")]
    [InlineData("wrong-quote")]
    [InlineData("missing-explanation")]
    [InlineData("duplicate-criterion")]
    public async Task ActualPythonEmitterAndDotNetConsumerAgreeOnReviewContract(string scenario)
    {
        var worker = Worker();
        File.Copy(Path.Combine(AppContext.BaseDirectory, "worker", "review.py"), Path.Combine(directory, "actual_review.py"));
        var content = JsonNode.Parse(Wire.Pack(competition.Submissions[0].ExampleReview))!;
        var findings = content["criteria"]!.AsArray();
        if (scenario == "wrong-quote") findings[0]!["evidence"]![0]!["quote"] = "Invented result outside every source passage.";
        if (scenario == "missing-explanation") findings[0]!["evidence"]![0]!.AsObject().Remove("explanation");
        if (scenario == "duplicate-criterion") findings[1]!["criterionId"] = findings[0]!["criterionId"]!.GetValue<string>();
        File.WriteAllText(Path.Combine(directory, "provider.json"), content.ToJsonString());
        File.Copy(Path.Combine(AppContext.BaseDirectory, "worker", "contract_provider.py"), Path.Combine(directory, "worker", "review.py"));
        if (scenario == "valid")
        {
            Rules.ValidateReview(Wire.Read<ReviewContent>(content.ToJsonString()), competition, competition.Submissions[0].Paragraphs);
            var saved = await worker.Run("tidewell", 1, CancellationToken.None);
            Assert.Equal(Rules.PromptVersion, saved.Review?.PromptVersion);
            Assert.Equal(Wire.Pack(competition.Submissions[0].ExampleReview), Wire.Pack(saved.Review!.Content));
            Assert.Equal("contract-test", saved.Review.Model);
        }
        else
        {
            Assert.Throws<DomainError>(() => Rules.ValidateReview(Wire.Read<ReviewContent>(content.ToJsonString()), competition, competition.Submissions[0].Paragraphs));
            var before = Wire.Pack(store.Get("tidewell"));
            var error = await Assert.ThrowsAsync<DomainError>(() => worker.Run("tidewell", 1, CancellationToken.None));
            Assert.Equal(502, error.Status);
            Assert.Equal(scenario switch
            {
                "wrong-quote" => "Citation is not verbatim in the identified passage.",
                "missing-explanation" => "Each quote needs an explanation of why it matters.",
                "duplicate-criterion" => "Unknown or duplicate criterion.",
                _ => throw new InvalidOperationException("Unknown contract fixture.")
            }, error.Message);
            Assert.Equal(before, Wire.Pack(store.Get("tidewell")));
        }
    }

    public void Dispose()
    {
        foreach (var child in children)
        {
            if (!child.HasExited) child.Kill(entireProcessTree: true);
            child.WaitForExit(5000);
            child.Dispose();
        }
        SqliteConnection.ClearAllPools();
        if (Directory.Exists(directory)) Directory.Delete(directory, true);
    }
}
