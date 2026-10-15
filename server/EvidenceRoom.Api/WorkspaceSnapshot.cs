using Microsoft.Data.Sqlite;

namespace EvidenceRoom;

public record StoredSnapshot(byte[] Content, string Generation);
public interface ISnapshotStorage
{
    StoredSnapshot? Download();
    string Upload(byte[] content, string expectedGeneration);
}

// SQLite stays on local disk. Only complete standalone backups enter object storage.
public sealed class WorkspaceSnapshot
{
    public const int MaximumBytes = 8 * 1024 * 1024;
    private readonly object gate = new();
    private readonly string path;
    private readonly ISnapshotStorage storage;
    private string generation = "0";
    private volatile bool healthy = true;
    public bool Healthy => healthy;

    public WorkspaceSnapshot(string path, ISnapshotStorage storage)
    {
        this.path = Path.GetFullPath(path);
        this.storage = storage;
        Directory.CreateDirectory(Path.GetDirectoryName(this.path)!);
        if (File.Exists(this.path)) throw new InvalidOperationException("Snapshot restore requires a fresh local database path.");
        var saved = storage.Download(); // Authorization or transport failure must never become an empty workspace.
        if (saved is null) return;
        if (saved.Content.Length < 16 || saved.Content.Length > MaximumBytes || !saved.Content.AsSpan(0, 16).SequenceEqual("SQLite format 3\0"u8))
            throw new InvalidDataException("The saved workspace is not a valid bounded SQLite snapshot.");
        File.WriteAllBytes(this.path, saved.Content);
        using var db = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = this.path, Mode = SqliteOpenMode.ReadOnly, Pooling = false }.ToString());
        db.Open();
        using var check = db.CreateCommand();
        check.CommandText = "PRAGMA integrity_check";
        if (check.ExecuteScalar() as string != "ok") throw new InvalidDataException("The saved workspace failed its integrity check.");
        check.CommandText = "SELECT COUNT(*) FROM sqlite_schema WHERE type='table' AND name IN ('entries','submissions','reviews','assessments','audit','budget','configuration')";
        if (Convert.ToInt64(check.ExecuteScalar()) != 7) throw new InvalidDataException("The saved workspace is missing required tables.");
        check.CommandText = "SELECT attempts FROM budget WHERE id=1";
        if (check.ExecuteScalar() is not long attempts || attempts < 0) throw new InvalidDataException("The saved workspace is missing its request allowance.");
        generation = saved.Generation;
    }

    public Access Enter()
    {
        Monitor.Enter(gate);
        if (healthy) return new Access(this);
        Monitor.Exit(gate);
        throw new DomainError(503, "The workspace is reconnecting to saved storage. Your unsaved text is still here; try again shortly.");
    }

    public sealed class Access(WorkspaceSnapshot owner) : IDisposable
    {
        private bool changed;
        public void Changed() => changed = true;
        public void Dispose()
        {
            try { if (changed) owner.Save(); }
            finally { Monitor.Exit(owner.gate); }
        }
    }

    private void Save()
    {
        var backupPath = path + ".snapshot";
        try
        {
            if (File.Exists(backupPath)) File.Delete(backupPath);
            using (var source = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = path, Pooling = false }.ToString()))
            using (var backup = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = backupPath, Pooling = false }.ToString()))
            {
                source.Open(); backup.Open(); source.BackupDatabase(backup);
            }
            var info = new FileInfo(backupPath);
            if (info.Length > MaximumBytes) throw new InvalidDataException("Workspace snapshot size limit reached.");
            generation = storage.Upload(File.ReadAllBytes(backupPath), generation);
        }
        catch
        {
            // The remote write may have committed even if its acknowledgement was lost.
            // Serve no further state until Cloud Run restarts and restores the durable object.
            healthy = false;
            throw new DomainError(503, "The workspace could not confirm that your changes were saved. Keep this page open and try again shortly.");
        }
        finally { if (File.Exists(backupPath)) File.Delete(backupPath); }
    }
}
