using Microsoft.Data.Sqlite;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace EvidenceRoom.Tests;

// Both database suites clear SQLite's process-wide pools during fixture cleanup.
[Collection("SQLite workspace")]
public sealed class ReviewTests : IDisposable
{
    private readonly string directory = Path.Combine(Path.GetTempPath(), "evidence-room-" + Guid.NewGuid().ToString("N"));
    private readonly Competition competition = Wire.Read<Competition>(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "competition.json")));
    private Store Database() => new(Path.Combine(directory, "test.sqlite"), competition);
    private AssessmentInput Score(int revision = 1, int version = 0, string? reviewId = null, bool finalize = false) => new(revision, version, reviewId, competition.Criteria.ToDictionary(c => c.Id, _ => (int?)2), "The measured trial is preliminary and excludes independent quality verification; request the missing field evidence before a pilot.", "clarify", true, finalize);

    [Fact]
    public void ChangedRubricCannotRelabelPersistedReviews()
    {
        var db = Database();
        var changed = competition with { Criteria = competition.Criteria.Select((c, i) => i == 0 ? c with { Description = "A different standard" } : c).ToArray() };
        var error = Assert.Throws<InvalidOperationException>(() => new Store(Path.Combine(directory, "test.sqlite"), changed));
        Assert.Contains("rubric differs", error.Message);
        Assert.Equal(3, db.List().Length);
        Assert.Equal(competition, Database().Competition);
    }

    [Fact]
    public void SeedIsIdempotentAndExamplesHaveValidCitations()
    {
        var first = Database(); var second = Database();
        Assert.Equal(3, second.List().Length);
        foreach (var entry in first.List())
        {
            var detail = second.Get(entry.Id);
            Assert.NotNull(detail.Review);
            Rules.ValidateReview(detail.Review.Content, competition, detail.Submission.Paragraphs);
            Assert.Null(detail.Assessment);
            Assert.Equal("example", detail.Review.Source);
        }
    }

    [Fact]
    public void RevisionPreservesOldCaseButStartsFreshReview()
    {
        var db = Database(); var original = db.Get("tidewell");
        db.SaveAssessment("tidewell", Score(reviewId: original.Review?.Id, finalize: true));
        var revised = db.Revise("tidewell", new("Tidewell Collective", "Revised pilot plan", string.Join("\n\n", original.Submission.Paragraphs.Select(p => p.Text)) + "\n\nA signed site agreement is now included in the test narrative.", 1));
        Assert.Equal(2, revised.Entry.Revision);
        Assert.Null(revised.Review); Assert.Null(revised.Assessment);
        var export = System.Text.Json.JsonDocument.Parse(Wire.Pack(db.Export("tidewell"))).RootElement;
        Assert.Equal(2, export.GetProperty("submissions").GetArrayLength());
        Assert.Single(export.GetProperty("assessments").EnumerateArray());
        Assert.True(export.GetProperty("assessments")[0].GetProperty("finalized").GetBoolean());
    }

    [Fact]
    public void RevisionConflictDoesNotOverwriteOrAddHistory()
    {
        var db = Database(); var original = db.Get("tidewell");
        var error = Assert.Throws<DomainError>(() => db.Revise("tidewell", new("Other team", "Stale edit", string.Join("\n\n", original.Submission.Paragraphs.Select(p => p.Text)), 0)));
        Assert.Equal(409, error.Status); Assert.Equal(original.Entry, db.Get("tidewell").Entry);
        Assert.Equal(original.Events.Length, db.Get("tidewell").Events.Length);
    }

    [Fact]
    public void DraftComputesWeightedTotalAndPersists()
    {
        var db = Database(); var detail = db.Get("commons");
        var input = Score(reviewId: detail.Review?.Id) with { Scores = new() { ["evidence"] = 3, ["resources"] = 1, ["delivery"] = 4, ["impact"] = 2 } };
        var saved = db.SaveAssessment("commons", input);
        Assert.Equal(63.75m, saved.Assessment?.Total);
        Assert.Equal(saved.Assessment?.Version, Database().Get("commons").Assessment?.Version);
    }

    [Fact]
    public void IncompleteDraftIsAllowedButCannotBeFinalized()
    {
        var db = Database(); var detail = db.Get("tidewell"); var input = Score(reviewId: detail.Review?.Id);
        input.Scores["evidence"] = null;
        var draft = db.SaveAssessment("tidewell", input);
        Assert.Null(draft.Assessment?.Total);
        Assert.Equal(400, Assert.Throws<DomainError>(() => db.SaveAssessment("tidewell", input with { ExpectedVersion = 1, Finalize = true })).Status);
        Assert.False(db.Get("tidewell").Assessment?.Finalized);
    }

    [Fact]
    public void CompetingDraftCannotSilentlyReplaceSavedDraft()
    {
        var db = Database(); var original = db.Get("tidewell");
        var input = Score(reviewId: original.Review?.Id);
        db.SaveAssessment("tidewell", input);
        Assert.Equal(409, Assert.Throws<DomainError>(() => db.SaveAssessment("tidewell", input with { Rationale = "An out-of-date writer is attempting to replace the saved rationale." })).Status);
        Assert.Equal(input.Rationale, db.Get("tidewell").Assessment?.Rationale);
    }

    [Fact]
    public void FinalRecommendationCannotBeChangedOrAnalyzedAgain()
    {
        var db = Database(); var original = db.Get("tidewell"); var input = Score(reviewId: original.Review?.Id, finalize: true);
        db.SaveAssessment("tidewell", input);
        Assert.Equal(409, Assert.Throws<DomainError>(() => db.SaveAssessment("tidewell", input with { ExpectedVersion = 1 })).Status);
        Assert.Equal(409, Assert.Throws<DomainError>(() => db.SaveReview("tidewell", 1, competition.Submissions[0].ExampleReview, "test-provider")).Status);
    }

    [Fact]
    public void AnalysisCannotAttachToAChangedSubmission()
    {
        var db = Database(); var original = db.Get("tidewell");
        db.Revise("tidewell", new(original.Entry.Team, "New version", string.Join("\n\n", original.Submission.Paragraphs.Select(p => p.Text)), 1));
        Assert.Equal(409, Assert.Throws<DomainError>(() => db.SaveReview("tidewell", 1, competition.Submissions[0].ExampleReview, "test-provider")).Status);
        Assert.Null(db.Get("tidewell").Review);
    }

    [Fact]
    public void NewAnalysisDoesNotOverwriteScoresAndRequiresAcknowledgingNewReference()
    {
        var db = Database(); var original = db.Get("tidewell"); var input = Score(reviewId: original.Review?.Id);
        db.SaveAssessment("tidewell", input);
        var analyzed = db.SaveReview("tidewell", 1, competition.Submissions[0].ExampleReview, "test-provider");
        Assert.Equal(2, analyzed.Assessment?.Scores["evidence"]);
        Assert.Equal(409, Assert.Throws<DomainError>(() => db.SaveAssessment("tidewell", input with { ExpectedVersion = 1 })).Status);
    }

    [Fact]
    public void UnknownAndInventedCitationsFailWithoutSaving()
    {
        var db = Database(); var entry = db.Get("tidewell"); var content = competition.Submissions[0].ExampleReview;
        var bad = content with { Criteria = content.Criteria.Select((c, i) => i == 0 ? c with { Evidence = [new("p2", "Independently verified and certified.")] } : c).ToArray() };
        Assert.Equal(502, Assert.Throws<DomainError>(() => db.SaveReview("tidewell", 1, bad, "test-provider")).Status);
        Assert.Equal(entry.Review?.Id, db.Get("tidewell").Review?.Id);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void MissingQuoteExplanationCannotReplaceSavedAnalysis(string? explanation)
    {
        var db = Database(); var original = db.Get("tidewell");
        var content = original.Review!.Content;
        var first = content.Criteria[0];
        var invalid = content with { Criteria = content.Criteria.Select((c, i) => i == 0 ? c with { Evidence = [first.Evidence[0] with { Explanation = explanation }] } : c).ToArray() };
        Assert.Equal(502, Assert.Throws<DomainError>(() => db.SaveReview("tidewell", 1, invalid, "test-provider")).Status);
        Assert.Equal(original.Review.Id, db.Get("tidewell").Review?.Id);
    }

    [Fact]
    public void QuoteExplanationsPersistIntoExportAndOversizedNotesFail()
    {
        var db = Database(); var content = competition.Submissions[1].ExampleReview;
        var saved = db.SaveReview("commons", 1, content, "test-provider");
        var packet = JsonDocument.Parse(Wire.Pack(Database().Export("commons"))).RootElement;
        var review = packet.GetProperty("current").GetProperty("review");
        Assert.Equal(Rules.PromptVersion, review.GetProperty("promptVersion").GetString());
        var notes = review.GetProperty("content").GetProperty("criteria")[2].GetProperty("evidence");
        Assert.Equal(2, notes.GetArrayLength());
        Assert.Equal(content.Criteria[2].Evidence[0].Explanation, notes[0].GetProperty("explanation").GetString());
        Assert.Equal(content.Criteria[2].Evidence[1].Explanation, notes[1].GetProperty("explanation").GetString());
        var oversized = content with { Criteria = content.Criteria.Select((c, i) => i == 0 ? c with { Evidence = [c.Evidence[0] with { Explanation = new string('x', 801) }] } : c).ToArray() };
        Assert.Throws<DomainError>(() => db.SaveReview("commons", 1, oversized, "test-provider"));
        Assert.Equal(saved.Review?.Id, db.Get("commons").Review?.Id);
    }

    [Fact]
    public void LegacyReviewsStayReadableAndOnlyUnassessedExamplesReceiveNewNotes()
    {
        var db = Database(); var final = db.Get("tidewell"); var draft = db.Get("clearcurrent");
        db.SaveAssessment("tidewell", Score(reviewId: final.Review?.Id, finalize: true));
        db.SaveAssessment("clearcurrent", Score(reviewId: draft.Review?.Id));
        var previousExample = db.Get("commons").Review;
        using (var connection = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = Path.Combine(directory, "test.sqlite") }.ToString()))
        {
            connection.Open();
            foreach (var seed in competition.Submissions)
            {
                var legacy = JsonNode.Parse(Wire.Pack(seed.ExampleReview))!;
                foreach (var criterion in legacy["criteria"]!.AsArray())
                    foreach (var cite in criterion!["evidence"]!.AsArray()) cite!.AsObject().Remove("explanation");
                using var update = connection.CreateCommand();
                update.CommandText = "UPDATE reviews SET prompt='evidence-review-v1', content=$content WHERE entry_id=$id";
                update.Parameters.AddWithValue("$content", legacy.ToJsonString());
                update.Parameters.AddWithValue("$id", seed.Id);
                update.ExecuteNonQuery();
            }
        }
        var upgraded = Database();
        Assert.Equal(final.Review?.Id, upgraded.Get("tidewell").Review?.Id);
        Assert.True(upgraded.Get("tidewell").Assessment?.Finalized);
        Assert.Null(upgraded.Get("tidewell").Review?.Content.Criteria[0].Evidence[0].Explanation);
        Assert.Equal(draft.Review?.Id, upgraded.Get("clearcurrent").Review?.Id);
        Assert.NotNull(upgraded.Get("clearcurrent").Assessment);
        var current = upgraded.Get("commons").Review!;
        Assert.NotEqual(previousExample?.Id, current.Id);
        Assert.All(current.Content.Criteria.SelectMany(c => c.Evidence), cite => Assert.False(string.IsNullOrWhiteSpace(cite.Explanation)));
        Assert.Equal(current.Id, Database().Get("commons").Review?.Id);
        var history = JsonDocument.Parse(Wire.Pack(upgraded.Export("commons"))).RootElement.GetProperty("reviews");
        Assert.Equal(2, history.GetArrayLength());
        Assert.Equal("evidence-review-v1", history[0].GetProperty("promptVersion").GetString());
        Assert.Equal(JsonValueKind.Null, history[0].GetProperty("content").GetProperty("criteria")[0].GetProperty("evidence")[0].GetProperty("explanation").ValueKind);
    }

    [Fact]
    public async Task DurableAllowanceCannotBeOverspentByConcurrentReservations()
    {
        var db = Database();
        var outcomes = await Task.WhenAll(Enumerable.Range(0, 8).Select(_ => Task.Run(() => { try { db.ReserveAttempt(3); return true; } catch (DomainError) { return false; } })));
        Assert.Equal(3, outcomes.Count(v => v)); Assert.Equal(3, Database().Attempts());
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(5)]
    public void OutOfRangeScoreIsRejected(int score)
    {
        var input = Score(); input.Scores["evidence"] = score;
        Assert.Equal(400, Assert.Throws<DomainError>(() => Rules.ValidateAssessment(input, competition)).Status);
    }
    [Fact]
    public void MissingIndependentConfirmationBlocksFinalization()
    {
        Assert.Equal(400, Assert.Throws<DomainError>(() => Rules.ValidateAssessment(Score(finalize: true) with { Confirmed = false }, competition)).Status);
    }
    [Fact]
    public void DuplicateAndMissingCriteriaFailReviewContract()
    {
        var seed = competition.Submissions[0];
        var duplicate = seed.ExampleReview with { Criteria = [seed.ExampleReview.Criteria[0], seed.ExampleReview.Criteria[0], seed.ExampleReview.Criteria[2], seed.ExampleReview.Criteria[3]] };
        Assert.Throws<DomainError>(() => Rules.ValidateReview(duplicate, competition, seed.Paragraphs));
    }
    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
        if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
    }
}
