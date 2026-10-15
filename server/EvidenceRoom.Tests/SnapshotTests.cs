using Microsoft.Data.Sqlite;

namespace EvidenceRoom.Tests;

[Collection("SQLite workspace")]
public sealed class SnapshotTests : IDisposable
{
    private readonly string directory = Path.Combine(Path.GetTempPath(), "evidence-snapshot-" + Guid.NewGuid().ToString("N"));
    private readonly Competition competition = Wire.Read<Competition>(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "competition.json")));
    private sealed class Blob : ISnapshotStorage
    {
        private readonly object gate = new();
        private byte[]? content;
        private int generation;
        public bool FailUpload;
        public bool LoseAcknowledgement;
        public Action? BeforeUpload;
        public StoredSnapshot? Download() { lock (gate) return content is null ? null : new(content.ToArray(), generation.ToString()); }
        public string Upload(byte[] next, string expected)
        {
            BeforeUpload?.Invoke();
            lock (gate)
            {
                if (FailUpload || expected != generation.ToString()) throw new IOException("Storage unavailable or generation conflict.");
                content = next.ToArray(); generation++;
                if (LoseAcknowledgement) throw new IOException("Response lost after remote commit.");
                return generation.ToString();
            }
        }
    }
    private (Store Store, WorkspaceSnapshot Snapshot) Open(Blob blob)
    {
        var path = Path.Combine(directory, Guid.NewGuid().ToString("N"), "workspace.sqlite");
        var snapshot = new WorkspaceSnapshot(path, blob);
        return (new Store(path, competition, snapshot), snapshot);
    }
    private EntryInput Input(string team = "Snapshot team") => new(team, "A test pilot", string.Join("\n\n", competition.Submissions[0].Paragraphs.Select(p => p.Text)), null);

    [Fact]
    public void RestartRestoresDraftFinalRecordExportAndAllowance()
    {
        var blob = new Blob(); var first = Open(blob).Store;
        var entry = first.Create(Input());
        var assessment = new AssessmentInput(1, 0, null, competition.Criteria.ToDictionary(c => c.Id, _ => (int?)2), "The reported evidence establishes an initial signal but still needs independent field validation.", "clarify", true, true);
        first.SaveAssessment(entry.Entry.Id, assessment);
        first.ReserveAttempt(3);
        var reopened = Open(blob).Store;
        Assert.True(reopened.Get(entry.Entry.Id).Assessment?.Finalized);
        Assert.Equal(1, reopened.Attempts());
        Assert.Equal(Wire.Pack(first.Get(entry.Entry.Id)), Wire.Pack(reopened.Get(entry.Entry.Id)));
        var originalPacket = System.Text.Json.JsonDocument.Parse(Wire.Pack(first.Export(entry.Entry.Id))).RootElement;
        var restoredPacket = System.Text.Json.JsonDocument.Parse(Wire.Pack(reopened.Export(entry.Entry.Id))).RootElement;
        foreach (var field in new[] { "reviews", "assessments", "submissions" })
            Assert.Equal(originalPacket.GetProperty(field).GetRawText(), restoredPacket.GetProperty(field).GetRawText());
    }

    [Fact]
    public void CompetingWriterCannotOverwriteOrSpendFromStaleSnapshot()
    {
        var blob = new Blob(); var first = Open(blob); var second = Open(blob);
        // Opening the second process committed a new durable generation.
        Assert.Throws<DomainError>(() => first.Store.ReserveAttempt(3));
        Assert.False(first.Snapshot.Healthy);
        Assert.Throws<DomainError>(() => first.Store.List());
        second.Store.ReserveAttempt(3);
        Assert.Equal(1, Open(blob).Store.Attempts());
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void UncertainWriteStopsAllReadsAndRestartUsesOnlyDurableState(bool committed)
    {
        var blob = new Blob(); var first = Open(blob);
        blob.FailUpload = !committed; blob.LoseAcknowledgement = committed;
        Assert.Throws<DomainError>(() => first.Store.Create(Input()));
        Assert.False(first.Snapshot.Healthy);
        Assert.Throws<DomainError>(() => first.Store.Get("tidewell"));
        Assert.Throws<DomainError>(() => first.Store.Export("tidewell"));
        blob.FailUpload = false; blob.LoseAcknowledgement = false;
        Assert.Equal(committed ? 4 : 3, Open(blob).Store.List().Length);
    }

    [Fact]
    public async Task ReadersWaitUntilMutationIsDurable()
    {
        var blob = new Blob(); var current = Open(blob);
        using var entered = new ManualResetEventSlim(); using var release = new ManualResetEventSlim();
        blob.BeforeUpload = () => { entered.Set(); if (!release.Wait(TimeSpan.FromSeconds(5))) throw new TimeoutException(); };
        var write = Task.Run(() => current.Store.Create(Input()));
        Assert.True(entered.Wait(TimeSpan.FromSeconds(5)));
        var read = Task.Run(() => current.Store.List());
        try { await Task.Delay(100); Assert.False(read.IsCompleted); }
        finally { release.Set(); }
        await write; Assert.Equal(4, (await read).Length);
    }

    [Fact]
    public async Task FailedReservationCannotReachProviderInput()
    {
        var blob = new Blob(); var current = Open(blob); blob.FailUpload = true;
        Directory.CreateDirectory(Path.Combine(directory, "worker"));
        File.WriteAllText(Path.Combine(directory, "worker", "review.py"), "import sys, pathlib\nif sys.stdin.buffer.read(): pathlib.Path('provider-input-received').write_text('received')\n");
        var settings = RuntimeSettings.FromEnvironment(name => name switch
        {
            "EVIDENCE_ROOT" => directory,
            "OPENAI_API_KEY" => "test-only",
            "PYTHON_EXECUTABLE" => Environment.GetEnvironmentVariable(name),
            _ => null
        });
        await Assert.ThrowsAsync<DomainError>(() => new ReviewWorker(settings, current.Store).Run("tidewell", 1, CancellationToken.None));
        Assert.False(File.Exists(Path.Combine(directory, "provider-input-received")));
        blob.FailUpload = false;
        Assert.Equal(0, Open(blob).Store.Attempts());
    }

    [Fact]
    public void CorruptOrUnavailableDownloadNeverStartsAnEmptyWorkspace()
    {
        var invalid = new Blob(); invalid.Upload([1, 2, 3], "0");
        Assert.Throws<InvalidDataException>(() => Open(invalid));
        Assert.Throws<IOException>(() => new WorkspaceSnapshot(Path.Combine(directory, "failed.sqlite"), new Unavailable()));
        var initial = new Blob { FailUpload = true };
        Assert.Throws<DomainError>(() => Open(initial));
        Assert.Null(initial.Download());
    }
    private sealed class Unavailable : ISnapshotStorage
    {
        public StoredSnapshot? Download() => throw new IOException("Download denied.");
        public string Upload(byte[] content, string generation) => throw new IOException();
    }

    [Fact]
    public void HostedDemoBoundsEntriesAndRepetitiveDraftHistory()
    {
        var blob = new Blob(); var db = Open(blob).Store;
        var detail = db.Get("tidewell");
        var draft = new AssessmentInput(1, 0, detail.Review?.Id, competition.Criteria.ToDictionary(c => c.Id, _ => (int?)null), "", "", false, false);
        db.SaveAssessment("tidewell", draft);
        db.SaveAssessment("tidewell", draft with { ExpectedVersion = 1 });
        Assert.Single(db.Get("tidewell").Events, e => e.Kind == "draft-saved");
        for (var i = 3; i < 50; i++) db.Create(Input("Team " + i));
        Assert.Equal(429, Assert.Throws<DomainError>(() => db.Create(Input())).Status);
        Assert.Equal(50, Open(blob).Store.List().Length);
    }
    [Fact]
    public void CapacityRejectionRollsBackWithoutPoisoningReadersOrExports()
    {
        var current = Open(new Blob());
        var path = Directory.GetFiles(directory, "workspace.sqlite", SearchOption.AllDirectories).Single();
        using (var db = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = path }.ToString()))
        {
            db.Open(); using var fill = db.CreateCommand();
            // Leave less than one valid submission of headroom in the page budget.
            fill.CommandText = "CREATE TABLE capacity_fixture(content BLOB); SELECT page_count * page_size FROM pragma_page_count, pragma_page_size";
            var size = Convert.ToInt64(fill.ExecuteScalar());
            fill.CommandText = "INSERT INTO capacity_fixture VALUES(zeroblob($bytes))";
            fill.Parameters.AddWithValue("$bytes", WorkspaceSnapshot.MaximumBytes - size - 8192);
            fill.ExecuteNonQuery();
            fill.CommandText = "SELECT page_count * page_size FROM pragma_page_count, pragma_page_size";
            fill.Parameters.Clear();
            Assert.InRange(Convert.ToInt64(fill.ExecuteScalar()), WorkspaceSnapshot.MaximumBytes - 8192, WorkspaceSnapshot.MaximumBytes);
        }
        var error = Assert.Throws<DomainError>(() => current.Store.Create(Input() with { Body = new string('x', 16000) }));
        Assert.Equal(429, error.Status);
        Assert.Contains("storage limit", error.Message);
        Assert.True(current.Snapshot.Healthy);
        Assert.Equal(3, current.Store.List().Length);
        Assert.NotNull(current.Store.Export("tidewell"));
    }

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
        if (Directory.Exists(directory)) Directory.Delete(directory, true);
    }
}
