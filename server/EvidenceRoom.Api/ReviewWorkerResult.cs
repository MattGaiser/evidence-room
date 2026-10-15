using System.Text.Json;

namespace EvidenceRoom;

public sealed record ReviewWorkerResult(ReviewContent Content, string Model)
{
    private sealed record Envelope(ReviewContent? Content, string? Model, string? PromptVersion, string? Error);

    public static ReviewWorkerResult Parse(string raw, int exitCode)
    {
        if (raw.Length > 100000) throw new DomainError(502, "The analysis exceeded the response limit. Nothing was saved.");
        Envelope? result;
        try { result = JsonSerializer.Deserialize<Envelope>(raw, Wire.Json); }
        catch (JsonException cause)
        {
            throw new DomainError(502, "The review worker returned an unreadable result. Nothing was saved.", cause, "read-worker-result");
        }
        if (result is null || exitCode != 0 || result.Error is not null || result.Content is null ||
            string.IsNullOrWhiteSpace(result.Model) || result.PromptVersion != Rules.PromptVersion)
            throw new DomainError(502, result?.Error ?? "The review worker could not complete the analysis. Nothing was saved.");
        return new(result.Content, result.Model);
    }
}
