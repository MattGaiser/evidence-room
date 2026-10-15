namespace EvidenceRoom.Tests;

public sealed class ReviewWorkerResultTests
{
    [Theory]
    [InlineData("null")]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("not JSON")]
    [InlineData("[]")]
    [InlineData("{}")]
    [InlineData("{\"content\": 42}")]
    public void MissingOrMalformedEnvelopeIsAnUpstreamFailure(string raw)
    {
        Assert.Equal(502, Assert.Throws<DomainError>(() => ReviewWorkerResult.Parse(raw, 0)).Status);
    }

    [Theory]
    [InlineData(0, "old-prompt")]
    [InlineData(1, Rules.PromptVersion)]
    public void FailedOrIncompatibleWorkerCannotReturnAValidLookingReview(int exit, string prompt)
    {
        var competition = Wire.Read<Competition>(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "competition.json")));
        var raw = Wire.Pack(new { content = competition.Submissions[0].ExampleReview, model = "test-model", promptVersion = prompt });
        Assert.Equal(502, Assert.Throws<DomainError>(() => ReviewWorkerResult.Parse(raw, exit)).Status);
    }

    [Fact]
    public void ValidEnvelopePreservesContentForIndependentDomainValidation()
    {
        var competition = Wire.Read<Competition>(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "competition.json")));
        var content = competition.Submissions[0].ExampleReview;
        var raw = Wire.Pack(new { content, model = "test-model", promptVersion = Rules.PromptVersion });
        var parsed = ReviewWorkerResult.Parse(raw, 0);
        Assert.Equal(Wire.Pack(content), Wire.Pack(parsed.Content));
        Rules.ValidateReview(parsed.Content, competition, competition.Submissions[0].Paragraphs);
    }
}
