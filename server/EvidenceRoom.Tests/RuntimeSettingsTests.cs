namespace EvidenceRoom.Tests;

public sealed class RuntimeSettingsTests
{
    [Theory]
    [InlineData("")]
    [InlineData("not-a-number")]
    [InlineData("-1")]
    [InlineData("101")]
    public void ExplicitInvalidAllowanceCannotSilentlyEnableDefaultSpending(string value)
    {
        var error = Assert.Throws<InvalidOperationException>(() => RuntimeSettings.FromEnvironment(name => name == "EVIDENCE_AI_LIMIT" ? value : null));
        Assert.Contains("EVIDENCE_AI_LIMIT", error.Message);
    }

    [Theory]
    [InlineData("http://demo.example")]
    [InlineData("https://demo.example/path")]
    [InlineData("https://demo.example?query=value")]
    [InlineData("https://user@demo.example")]
    [InlineData("")]
    public void HostedOriginMustBeAnExactHttpsAuthority(string origin)
    {
        Assert.Throws<InvalidOperationException>(() => RuntimeSettings.FromEnvironment(name => name switch
        {
            "K_SERVICE" => "test",
            "PUBLIC_ORIGINS" => origin,
            "EVIDENCE_SNAPSHOT_BUCKET" => "private-bucket",
            _ => null
        }));
    }

    [Theory]
    [InlineData("0")]
    [InlineData("65536")]
    [InlineData("invalid")]
    public void HostedPortMustBeUsable(string port)
    {
        Assert.Throws<InvalidOperationException>(() => RuntimeSettings.FromEnvironment(name => name switch
        {
            "K_SERVICE" => "test",
            "PUBLIC_ORIGINS" => "https://demo.example",
            "EVIDENCE_SNAPSHOT_BUCKET" => "private-bucket",
            "PORT" => port,
            _ => null
        }));
    }

    [Fact]
    public void ZeroAllowanceIsValidAndSettingsNeverContainTheCredential()
    {
        const string secret = "a-private-test-only-credential";
        var settings = RuntimeSettings.FromEnvironment(name => name switch
        {
            "EVIDENCE_AI_LIMIT" => "0",
            "OPENAI_API_KEY" => secret,
            _ => null
        });
        Assert.True(settings.AiConfigured);
        Assert.Equal(0, settings.AiAttemptLimit);
        Assert.DoesNotContain(secret, settings.ToString());
    }
}
