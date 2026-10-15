using System.Collections.Frozen;

namespace EvidenceRoom;

// Parse once at startup. Credentials stay in the worker's environment, outside this record.
public sealed record RuntimeSettings(
    string Root,
    string DatabasePath,
    bool Hosted,
    FrozenSet<string> PublicOrigins,
    string? SnapshotBucket,
    int Port,
    bool AiConfigured,
    int AiAttemptLimit,
    string PythonExecutable)
{
    public static RuntimeSettings FromEnvironment(Func<string, string?>? read = null)
    {
        read ??= Environment.GetEnvironmentVariable;
        var root = Path.GetFullPath(read("EVIDENCE_ROOT") ?? Directory.GetCurrentDirectory());
        var hosted = !string.IsNullOrWhiteSpace(read("K_SERVICE"));
        var origins = hosted
            ? (read("PUBLIC_ORIGINS") ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            : [];
        if (hosted && (origins.Length == 0 || origins.Any(origin =>
                !Uri.TryCreate(origin, UriKind.Absolute, out var uri) || uri.Scheme != "https" ||
                uri.UserInfo != "" || uri.GetLeftPart(UriPartial.Authority) != origin)))
            throw new InvalidOperationException("Hosted execution requires exact HTTPS PUBLIC_ORIGINS.");
        var bucket = read("EVIDENCE_SNAPSHOT_BUCKET");
        if (hosted && string.IsNullOrWhiteSpace(bucket))
            throw new InvalidOperationException("Hosted execution requires a private snapshot bucket.");
        var port = hosted ? Integer(read("PORT"), 8080, 1, 65535, "PORT") : 8080;
        var limit = Integer(read("EVIDENCE_AI_LIMIT"), 10, 0, 100, "EVIDENCE_AI_LIMIT");
        var python = read("PYTHON_EXECUTABLE") ?? (OperatingSystem.IsWindows() ? "python" : "python3");
        if (string.IsNullOrWhiteSpace(python)) throw new InvalidOperationException("PYTHON_EXECUTABLE must name an executable.");
        return new(root, read("EVIDENCE_DB") ?? Path.Combine(root, ".local", "evidence.sqlite"), hosted,
            origins.ToFrozenSet(StringComparer.Ordinal), bucket, port,
            read("EVIDENCE_DISABLE_AI") != "1" && !string.IsNullOrWhiteSpace(read("OPENAI_API_KEY")), limit, python);
    }

    private static int Integer(string? value, int fallback, int minimum, int maximum, string name)
    {
        if (value is null) return fallback;
        if (!int.TryParse(value, out var number) || number < minimum || number > maximum)
            throw new InvalidOperationException($"{name} must be an integer from {minimum} to {maximum}.");
        return number;
    }
}
