using Microsoft.Data.Sqlite;

namespace EvidenceRoom;

public sealed class Store
{
    private readonly string connectionString;
    private readonly WorkspaceSnapshot? persistence;
    public Competition Competition { get; }
    private static string Now() => DateTimeOffset.UtcNow.ToString("O");

    public Store(string path, Competition competition, WorkspaceSnapshot? persistence = null)
    {
        this.persistence = persistence;
        using var access = persistence?.Enter();
        Competition = competition;
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!);
        connectionString = new SqliteConnectionStringBuilder { DataSource = path, ForeignKeys = true, DefaultTimeout = 5 }.ToString();
        using var db = Open();
        using var schema = db.CreateCommand();
        schema.CommandText = """
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS entries (id TEXT PRIMARY KEY, team TEXT NOT NULL, title TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS submissions (entry_id TEXT NOT NULL REFERENCES entries(id), revision INTEGER NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(entry_id, revision));
            CREATE TABLE IF NOT EXISTS reviews (id TEXT PRIMARY KEY, entry_id TEXT NOT NULL, revision INTEGER NOT NULL, rubric INTEGER NOT NULL, source TEXT NOT NULL, model TEXT NOT NULL, prompt TEXT NOT NULL, created_at TEXT NOT NULL, content TEXT NOT NULL, FOREIGN KEY(entry_id,revision) REFERENCES submissions(entry_id,revision));
            CREATE TABLE IF NOT EXISTS assessments (entry_id TEXT NOT NULL, revision INTEGER NOT NULL, version INTEGER NOT NULL, content TEXT NOT NULL, finalized INTEGER NOT NULL, PRIMARY KEY(entry_id,revision), FOREIGN KEY(entry_id,revision) REFERENCES submissions(entry_id,revision));
            CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, entry_id TEXT NOT NULL REFERENCES entries(id), revision INTEGER NOT NULL, kind TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS budget (id INTEGER PRIMARY KEY CHECK(id=1), attempts INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS configuration (id INTEGER PRIMARY KEY CHECK(id=1), rubric TEXT NOT NULL);
            INSERT OR IGNORE INTO budget VALUES(1,0);
            """;
        schema.ExecuteNonQuery();
        using var tx = db.BeginTransaction();
        var snapshot = Wire.Pack(new { competition.Id, competition.Name, competition.Round, competition.Version, competition.Brief, competition.Criteria });
        using var config = Command(db, tx, "SELECT rubric FROM configuration WHERE id=1");
        if (config.ExecuteScalar() is string saved)
        {
            if (saved != snapshot)
                throw new InvalidOperationException("The rubric differs from this workspace's saved configuration. Restore the original competition.json or set EVIDENCE_DB to a new file; saved reviews cannot be relabeled with a changed rubric.");
        }
        else
        {
            using var existing = Command(db, tx, "SELECT COUNT(*) FROM entries");
            if (Convert.ToInt64(existing.ExecuteScalar()) != 0)
                throw new InvalidOperationException("This workspace predates rubric snapshots. Preserve it as a backup and set EVIDENCE_DB to a new file; its historical rubric cannot be verified automatically.");
            Execute(db, tx, "INSERT INTO configuration VALUES(1,$rubric)", ("$rubric", snapshot));
        }
        foreach (var seed in competition.Submissions)
        {
            var inserted = Execute(db, tx, "INSERT OR IGNORE INTO entries VALUES($id,$team,$title,1,$at)", ("$id", seed.Id), ("$team", seed.Team), ("$title", seed.Title), ("$at", Now()));
            if (inserted == 0)
            {
                var current = Detail(db, tx, seed.Id);
                // Append updated authored examples only before a reviewer has started a scorecard.
                // Keep prior analyses, user work, and final recommendations intact.
                if (current.Entry.Revision == 1 && current.Assessment is null &&
                    current.Review is { Source: "example", PromptVersion: "evidence-review-v1" } &&
                    current.Submission.Paragraphs.SequenceEqual(seed.Paragraphs))
                {
                    Rules.ValidateReview(seed.ExampleReview, competition, seed.Paragraphs);
                    InsertReview(db, tx, seed.Id, 1, seed.ExampleReview, "example", "Authored example");
                    Audit(db, tx, seed.Id, 1, "example-updated", "Example analysis updated with quote explanations. Previous analysis retained in history.");
                }
                continue;
            }
            Execute(db, tx, "INSERT INTO submissions VALUES($id,1,$title,$content,$at)", ("$id", seed.Id), ("$title", seed.Title), ("$content", Wire.Pack(seed.Paragraphs)), ("$at", Now()));
            Rules.ValidateReview(seed.ExampleReview, competition, seed.Paragraphs);
            InsertReview(db, tx, seed.Id, 1, seed.ExampleReview, "example", "Authored example");
            Audit(db, tx, seed.Id, 1, "received", "Example submission added to this workspace.");
        }
        Commit(db, tx);
        access?.Changed();
    }

    private void Commit(SqliteConnection db, SqliteTransaction tx)
    {
        if (persistence is not null)
        {
            using var size = Command(db, tx, "SELECT page_count * page_size FROM pragma_page_count, pragma_page_size");
            if (Convert.ToInt64(size.ExecuteScalar()) > WorkspaceSnapshot.MaximumBytes)
                throw new DomainError(429, "This shared demo has reached its storage limit. You can still review and export existing entries.");
        }
        tx.Commit();
    }

    private SqliteConnection Open()
    {
        var db = new SqliteConnection(connectionString);
        db.Open();
        return db;
    }
    private static SqliteCommand Command(SqliteConnection db, SqliteTransaction? tx, string sql, params (string, object?)[] args)
    {
        var command = db.CreateCommand();
        command.Transaction = tx;
        command.CommandText = sql;
        foreach (var (name, value) in args) command.Parameters.AddWithValue(name, value ?? DBNull.Value);
        return command;
    }
    private static int Execute(SqliteConnection db, SqliteTransaction? tx, string sql, params (string, object?)[] args)
    {
        using var command = Command(db, tx, sql, args);
        return command.ExecuteNonQuery();
    }
    private static void Audit(SqliteConnection db, SqliteTransaction tx, string id, int revision, string kind, string message) =>
        Execute(db, tx, "INSERT INTO audit(entry_id,revision,kind,message,created_at) VALUES($id,$rev,$kind,$message,$at)", ("$id", id), ("$rev", revision), ("$kind", kind), ("$message", message), ("$at", Now()));

    public EntrySummary[] List()
    {
        using var access = persistence?.Enter();
        using var db = Open();
        using var command = Command(db, null, "SELECT e.id,e.team,e.title,e.revision,e.updated_at,COALESCE(a.finalized,0),a.content FROM entries e LEFT JOIN assessments a ON a.entry_id=e.id AND a.revision=e.revision ORDER BY e.rowid");
        using var rows = command.ExecuteReader();
        var result = new List<EntrySummary>();
        while (rows.Read()) result.Add(new EntrySummary(rows.GetString(0), rows.GetString(1), rows.GetString(2), rows.GetInt32(3), rows.GetInt32(5) == 1 ? "reviewed" : rows.IsDBNull(6) ? "unreviewed" : "draft", rows.GetString(4)));
        return [.. result];
    }
    public EntryDetail Get(string id)
    {
        using var access = persistence?.Enter();
        using var db = Open();
        using var tx = db.BeginTransaction(deferred: true);
        var result = Detail(db, tx, id);
        tx.Commit();
        return result;
    }
    private EntryDetail Detail(SqliteConnection db, SqliteTransaction tx, string id)
    {
        using var command = Command(db, tx, "SELECT e.team,e.title,e.revision,e.updated_at,s.content,s.created_at FROM entries e JOIN submissions s ON s.entry_id=e.id AND s.revision=e.revision WHERE e.id=$id", ("$id", id));
        using var row = command.ExecuteReader();
        if (!row.Read()) throw new DomainError(404, "That entry was not found.");
        var team = row.GetString(0); var title = row.GetString(1); var revision = row.GetInt32(2); var at = row.GetString(3);
        var submission = new SubmissionVersion(id, revision, title, Wire.Read<Paragraph[]>(row.GetString(4)), row.GetString(5));
        row.Close();
        using var reviewCommand = Command(db, tx, "SELECT id,rubric,source,model,prompt,created_at,content FROM reviews WHERE entry_id=$id AND revision=$rev ORDER BY rowid DESC LIMIT 1", ("$id", id), ("$rev", revision));
        using var reviewRow = reviewCommand.ExecuteReader();
        ReviewRecord? review = reviewRow.Read() ? new(reviewRow.GetString(0), revision, reviewRow.GetInt32(1), reviewRow.GetString(2), reviewRow.GetString(3), reviewRow.GetString(4), reviewRow.GetString(5), Wire.Read<ReviewContent>(reviewRow.GetString(6))) : null;
        reviewRow.Close();
        using var assessmentCommand = Command(db, tx, "SELECT content FROM assessments WHERE entry_id=$id AND revision=$rev", ("$id", id), ("$rev", revision));
        var assessment = assessmentCommand.ExecuteScalar() is string content ? Wire.Read<Assessment>(content) : null;
        using var auditCommand = Command(db, tx, "SELECT id,revision,kind,message,created_at FROM audit WHERE entry_id=$id ORDER BY id DESC", ("$id", id));
        using var events = auditCommand.ExecuteReader();
        var audit = new List<AuditEvent>();
        while (events.Read()) audit.Add(new(events.GetInt64(0), events.GetInt32(1), events.GetString(2), events.GetString(3), events.GetString(4)));
        return new(new(id, team, title, revision, assessment?.Finalized == true ? "reviewed" : assessment is null ? "unreviewed" : "draft", at), submission, review, assessment, [.. audit]);
    }

    public EntryDetail Create(EntryInput input)
    {
        using var access = persistence?.Enter();
        var paragraphs = Rules.ValidateEntry(input);
        var id = Guid.NewGuid().ToString("N");
        using var db = Open(); using var tx = db.BeginTransaction();
        if (persistence is not null)
        {
            using var count = Command(db, tx, "SELECT COUNT(*) FROM entries");
            if (Convert.ToInt64(count.ExecuteScalar()) >= 50) throw new DomainError(429, "This shared demo has reached its 50-entry limit. You can still review existing entries.");
        }
        Execute(db, tx, "INSERT INTO entries VALUES($id,$team,$title,1,$at)", ("$id", id), ("$team", input.Team.Trim()), ("$title", input.Title.Trim()), ("$at", Now()));
        Execute(db, tx, "INSERT INTO submissions VALUES($id,1,$title,$content,$at)", ("$id", id), ("$title", input.Title.Trim()), ("$content", Wire.Pack(paragraphs)), ("$at", Now()));
        Audit(db, tx, id, 1, "received", "Submission received. Ready for evidence review.");
        var result = Detail(db, tx, id); Commit(db, tx); access?.Changed(); return result;
    }
    public EntryDetail Revise(string id, EntryInput input)
    {
        using var access = persistence?.Enter();
        var paragraphs = Rules.ValidateEntry(input);
        using var db = Open(); using var tx = db.BeginTransaction();
        var current = Detail(db, tx, id);
        if (current.Entry.Revision != input.ExpectedRevision) throw new DomainError(409, "This submission changed in another tab. Reload the entry before saving your revision.");
        if (input.Team.Trim() != current.Entry.Team) throw new DomainError(400, "A revision must keep the team identity. Add a new entry for another team.");
        if (persistence is not null && current.Entry.Revision >= 10) throw new DomainError(429, "This demo entry has reached its 10-version limit. Start a new submission to continue.");
        var revision = current.Entry.Revision + 1;
        Execute(db, tx, "UPDATE entries SET team=$team,title=$title,revision=$rev,updated_at=$at WHERE id=$id", ("$id", id), ("$team", input.Team.Trim()), ("$title", input.Title.Trim()), ("$rev", revision), ("$at", Now()));
        Execute(db, tx, "INSERT INTO submissions VALUES($id,$rev,$title,$content,$at)", ("$id", id), ("$rev", revision), ("$title", input.Title.Trim()), ("$content", Wire.Pack(paragraphs)), ("$at", Now()));
        Audit(db, tx, id, revision, "revised", $"Submission version {revision} received. Previous analyses and assessments remain in the case history.");
        var result = Detail(db, tx, id); Commit(db, tx); access?.Changed(); return result;
    }
    private string InsertReview(SqliteConnection db, SqliteTransaction tx, string id, int revision, ReviewContent content, string source, string model)
    {
        var reviewId = Guid.NewGuid().ToString("N");
        Execute(db, tx, "INSERT INTO reviews VALUES($rid,$id,$rev,$rubric,$source,$model,$prompt,$at,$content)", ("$rid", reviewId), ("$id", id), ("$rev", revision), ("$rubric", Competition.Version), ("$source", source), ("$model", model), ("$prompt", Rules.PromptVersion), ("$at", Now()), ("$content", Wire.Pack(content)));
        return reviewId;
    }
    public EntryDetail SaveReview(string id, int expectedRevision, ReviewContent content, string model)
    {
        using var access = persistence?.Enter();
        using var db = Open(); using var tx = db.BeginTransaction();
        var current = Detail(db, tx, id);
        if (current.Entry.Revision != expectedRevision) throw new DomainError(409, "The submission changed during analysis. No stale analysis was attached; run it again for the new version.");
        if (current.Assessment?.Finalized == true) throw new DomainError(409, "This version has a final recommendation. Submit a revision to begin a new review.");
        Rules.ValidateReview(content, Competition, current.Submission.Paragraphs);
        InsertReview(db, tx, id, expectedRevision, content, "openai", model);
        Audit(db, tx, id, expectedRevision, "analyzed", "AI evidence analysis saved after citation validation.");
        var result = Detail(db, tx, id); Commit(db, tx); access?.Changed(); return result;
    }
    public EntryDetail SaveAssessment(string id, AssessmentInput input)
    {
        using var access = persistence?.Enter();
        var total = Rules.ValidateAssessment(input, Competition);
        using var db = Open(); using var tx = db.BeginTransaction();
        var current = Detail(db, tx, id);
        if (current.Entry.Revision != input.ExpectedRevision || (current.Assessment?.Version ?? 0) != input.ExpectedVersion)
            throw new DomainError(409, "This entry or scorecard changed in another tab. Your text is still here; reload before saving.");
        if (current.Assessment?.Finalized == true) throw new DomainError(409, "The final recommendation is locked. Submit a revision for a new assessment.");
        if (input.ReviewId != current.Review?.Id) throw new DomainError(409, "The evidence analysis changed. Reload and check the latest analysis before saving.");
        var next = new Assessment(input.ExpectedVersion + 1, input.ExpectedRevision, Competition.Version, input.ReviewId, input.Scores, input.Rationale.Trim(), input.Outcome, input.Confirmed, input.Finalize, total, Now());
        Execute(db, tx, "INSERT INTO assessments VALUES($id,$rev,$version,$content,$final) ON CONFLICT(entry_id,revision) DO UPDATE SET version=excluded.version,content=excluded.content,finalized=excluded.finalized", ("$id", id), ("$rev", input.ExpectedRevision), ("$version", next.Version), ("$content", Wire.Pack(next)), ("$final", input.Finalize ? 1 : 0));
        if (persistence is not null) Execute(db, tx, "DELETE FROM audit WHERE entry_id=$id AND revision=$rev AND kind='draft-saved'", ("$id", id), ("$rev", input.ExpectedRevision));
        Audit(db, tx, id, input.ExpectedRevision, input.Finalize ? "finalized" : "draft-saved", input.Finalize ? $"Human recommendation recorded: {input.Outcome}. Weighted score {total:0.##}/100." : "Reviewer scorecard draft saved.");
        var result = Detail(db, tx, id); Commit(db, tx); access?.Changed(); return result;
    }
    public int Attempts()
    {
        using var access = persistence?.Enter();
        using var db = Open(); using var command = Command(db, null, "SELECT attempts FROM budget WHERE id=1");
        return Convert.ToInt32(command.ExecuteScalar());
    }
    public void ReserveAttempt(int limit)
    {
        using var access = persistence?.Enter();
        using var db = Open(); using var tx = db.BeginTransaction();
        if (Execute(db, tx, "UPDATE budget SET attempts=attempts+1 WHERE id=1 AND attempts<$limit", ("$limit", limit)) == 0)
            throw new DomainError(429, "The configured AI allowance has been used. You can continue reviewing and scoring manually.");
        Commit(db, tx);
        access?.Changed();
    }
    public object Export(string id)
    {
        using var access = persistence?.Enter();
        using var db = Open(); using var tx = db.BeginTransaction(deferred: true);
        var current = Detail(db, tx, id);
        using var versionsCommand = Command(db, tx, "SELECT revision,title,content,created_at FROM submissions WHERE entry_id=$id ORDER BY revision", ("$id", id));
        using var rows = versionsCommand.ExecuteReader(); var versions = new List<SubmissionVersion>();
        while (rows.Read()) versions.Add(new(id, rows.GetInt32(0), rows.GetString(1), Wire.Read<Paragraph[]>(rows.GetString(2)), rows.GetString(3)));
        rows.Close();
        using var allReviews = Command(db, tx, "SELECT id,revision,rubric,source,model,prompt,created_at,content FROM reviews WHERE entry_id=$id ORDER BY rowid", ("$id", id));
        using var reviewRows = allReviews.ExecuteReader(); var reviews = new List<ReviewRecord>();
        while (reviewRows.Read()) reviews.Add(new(reviewRows.GetString(0), reviewRows.GetInt32(1), reviewRows.GetInt32(2), reviewRows.GetString(3), reviewRows.GetString(4), reviewRows.GetString(5), reviewRows.GetString(6), Wire.Read<ReviewContent>(reviewRows.GetString(7))));
        reviewRows.Close();
        using var allAssessments = Command(db, tx, "SELECT content FROM assessments WHERE entry_id=$id ORDER BY revision", ("$id", id));
        using var assessmentRows = allAssessments.ExecuteReader(); var assessments = new List<Assessment>();
        while (assessmentRows.Read()) assessments.Add(Wire.Read<Assessment>(assessmentRows.GetString(0)));
        assessmentRows.Close(); tx.Commit();
        return new { formatVersion = 1, exportedAt = Now(), competition = new { Competition.Id, Competition.Name, Competition.Round, Competition.Version, Competition.Brief, Competition.Criteria }, current, submissions = versions, reviews, assessments };
    }
}
