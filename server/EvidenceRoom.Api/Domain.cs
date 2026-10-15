using System.Text.Json;

namespace EvidenceRoom;

public static class Wire
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    public static string Pack<T>(T value) => JsonSerializer.Serialize(value, Json);
    public static T Read<T>(string value) => JsonSerializer.Deserialize<T>(value, Json) ?? throw new InvalidDataException("Empty data.");
}

public sealed class DomainError(int status, string message) : Exception(message)
{
    public int Status { get; } = status;
}

public record Criterion(string Id, string Name, int Weight, string Description);
public record Paragraph(string Id, string Text);
// Nullable only for reading reviews saved before quote explanations were introduced.
public record Citation(string ParagraphId, string Quote, string? Explanation = null);
public record ReviewFlag(string Kind, string ParagraphId, string Quote, string Message);
public record ReviewContent(string Summary, CriterionFinding[] Criteria, ReviewFlag[] Flags);
public record CriterionFinding(string CriterionId, string Status, string Finding, Citation[] Evidence, string? Question);
public record SeedEntry(string Id, string Team, string Title, Paragraph[] Paragraphs, ReviewContent ExampleReview);
public record Competition(string Id, string Name, string Round, int Version, string Brief, Criterion[] Criteria, SeedEntry[] Submissions);
public record EntrySummary(string Id, string Team, string Title, int Revision, string Status, string UpdatedAt);
public record SubmissionVersion(string EntryId, int Revision, string Title, Paragraph[] Paragraphs, string CreatedAt);
public record ReviewRecord(string Id, int SubmissionRevision, int RubricVersion, string Source, string Model, string PromptVersion, string CreatedAt, ReviewContent Content);
public record Assessment(int Version, int SubmissionRevision, int RubricVersion, string? ReviewId, Dictionary<string, int?> Scores, string Rationale, string Outcome, bool Confirmed, bool Finalized, decimal? Total, string UpdatedAt);
public record AuditEvent(long Id, int Revision, string Kind, string Message, string CreatedAt);
public record EntryDetail(EntrySummary Entry, SubmissionVersion Submission, ReviewRecord? Review, Assessment? Assessment, AuditEvent[] Events);
public record EntryInput(string Team, string Title, string Body, int? ExpectedRevision);
public record ReviewInput(int ExpectedRevision);
public record AssessmentInput(int ExpectedRevision, int ExpectedVersion, string? ReviewId, Dictionary<string, int?> Scores, string Rationale, string Outcome, bool Confirmed, bool Finalize);

public static class Rules
{
    public const string PromptVersion = "evidence-review-v2";
    public static Paragraph[] ValidateEntry(EntryInput input)
    {
        if (string.IsNullOrWhiteSpace(input.Team) || input.Team.Trim().Length > 80)
            throw new DomainError(400, "Enter a team name of 1–80 characters.");
        if (string.IsNullOrWhiteSpace(input.Title) || input.Title.Trim().Length > 120)
            throw new DomainError(400, "Enter a title of 1–120 characters.");
        if (string.IsNullOrWhiteSpace(input.Body) || input.Body.Trim().Length is < 80 or > 16000)
            throw new DomainError(400, "The submission must contain 80–16,000 characters.");
        var parts = System.Text.RegularExpressions.Regex.Split(input.Body.Replace("\r\n", "\n").Trim(), @"\n\s*\n")
            .Select(p => p.Trim()).Where(p => p.Length > 0).ToArray();
        if (parts.Length > 30) throw new DomainError(400, "Use no more than 30 passages, separated by blank lines.");
        return parts.Select((text, index) => new Paragraph($"p{index + 1}", text)).ToArray();
    }

    public static void ValidateReview(ReviewContent review, Competition competition, Paragraph[] paragraphs)
    {
        if (review is null || string.IsNullOrWhiteSpace(review.Summary) || review.Summary.Length > 1500 || review.Criteria is null || review.Flags is null)
            throw new DomainError(502, "The analysis did not meet the review contract. Your work is unchanged.");
        var expected = competition.Criteria.Select(c => c.Id).ToHashSet();
        if (review.Criteria.Length != expected.Count || !review.Criteria.Select(c => c?.CriterionId).ToHashSet().SetEquals(expected))
            throw new DomainError(502, "The analysis omitted or duplicated a rubric criterion. Your work is unchanged.");
        foreach (var finding in review.Criteria)
        {
            if (finding.Status is not ("documented" or "partial" or "missing") || string.IsNullOrWhiteSpace(finding.Finding) || finding.Finding.Length > 1500 || finding.Evidence is null || finding.Evidence.Length > 4)
                throw new DomainError(502, "The analysis contained an invalid finding. Your work is unchanged.");
            if ((finding.Status == "missing" && finding.Evidence.Length != 0) || (finding.Status != "missing" && finding.Evidence.Length == 0))
                throw new DomainError(502, "The analysis did not distinguish cited evidence from missing evidence.");
            if (finding.Status != "documented" && string.IsNullOrWhiteSpace(finding.Question))
                throw new DomainError(502, "The analysis did not explain how to resolve an evidence gap.");
            if (finding.Question?.Length > 1000) throw new DomainError(502, "The analysis question was too long.");
            foreach (var citation in finding.Evidence)
            {
                CheckCitation(citation, paragraphs);
                if (string.IsNullOrWhiteSpace(citation.Explanation) || citation.Explanation.Length > 800)
                    throw new DomainError(502, "The analysis did not explain why a quote matters. No analysis was saved.");
            }
        }
        if (review.Flags.Length > 5) throw new DomainError(502, "The analysis returned too many flags.");
        foreach (var flag in review.Flags)
        {
            if (flag is null || flag.Kind is not ("instruction-in-text" or "scope-question") || string.IsNullOrWhiteSpace(flag.Message) || flag.Message.Length > 1000)
                throw new DomainError(502, "The analysis returned an invalid flag.");
            CheckCitation(new Citation(flag.ParagraphId, flag.Quote), paragraphs);
        }
    }

    private static void CheckCitation(Citation citation, Paragraph[] paragraphs)
    {
        if (citation is null || string.IsNullOrWhiteSpace(citation.Quote) || citation.Quote.Length > 1500 || !paragraphs.Any(p => p.Id == citation.ParagraphId && p.Text.Contains(citation.Quote, StringComparison.Ordinal)))
            throw new DomainError(502, "A cited passage could not be verified against this submission. No analysis was saved.");
    }

    public static decimal? ValidateAssessment(AssessmentInput input, Competition competition)
    {
        if (input.Scores is null || !input.Scores.Keys.ToHashSet().SetEquals(competition.Criteria.Select(c => c.Id)) || input.Scores.Values.Any(v => v is < 0 or > 4))
            throw new DomainError(400, "Use one score from 0 to 4 for each rubric criterion.");
        if (input.Rationale is null || input.Rationale.Length > 4000 || input.Outcome is not ("" or "advance" or "clarify" or "decline"))
            throw new DomainError(400, "The rationale or recommendation could not be read.");
        if (input.Finalize && (input.Scores.Values.Any(v => v is null) || input.Rationale.Trim().Length < 40 || input.Outcome == "" || !input.Confirmed))
            throw new DomainError(400, "Score every criterion, write a rationale of at least 40 characters, choose a recommendation, and confirm your independent review.");
        if (input.Scores.Values.Any(v => v is null)) return null;
        return competition.Criteria.Sum(c => (decimal)(input.Scores[c.Id] ?? 0) / 4 * c.Weight);
    }
}
