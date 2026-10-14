using System.Diagnostics;

namespace EvidenceRoom;

public sealed class ReviewWorker(string root, Store store)
{
    private readonly SemaphoreSlim gate = new(1, 1);
    private static bool TryStop(Process process)
    {
        try { if (!process.HasExited) process.Kill(entireProcessTree: true); return true; }
        catch (InvalidOperationException) { return true; }
        catch (System.ComponentModel.Win32Exception) { return false; }
        catch (AggregateException) { return false; }
    }
    public bool Available => Environment.GetEnvironmentVariable("EVIDENCE_DISABLE_AI") != "1" && !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("OPENAI_API_KEY"));
    public int Limit => int.TryParse(Environment.GetEnvironmentVariable("EVIDENCE_AI_LIMIT"), out var limit) && limit is >= 0 and <= 100 ? limit : 10;
    private record WorkerResult(ReviewContent? Content, string? Model, string? PromptVersion, string? Error);

    public async Task<EntryDetail> Run(string id, int revision, CancellationToken cancel)
    {
        if (!Available) throw new DomainError(503, "AI is not configured. You can use the example analyses or score the entry manually.");
        if (!await gate.WaitAsync(0, cancel)) throw new DomainError(429, "Another analysis is running. Try again when it finishes.");
        try
        {
            var entry = store.Get(id);
            if (entry.Entry.Revision != revision) throw new DomainError(409, "The submission changed. Reload it before running the analysis.");
            if (entry.Assessment?.Finalized == true) throw new DomainError(409, "This recommendation is final. Submit a revision to start another review.");
            cancel.ThrowIfCancellationRequested();
            var executable = Environment.GetEnvironmentVariable("PYTHON_EXECUTABLE") ?? (OperatingSystem.IsWindows() ? "python" : "python3");
            var info = new ProcessStartInfo(executable) { RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = root };
            info.ArgumentList.Add(Path.Combine(root, "worker", "review.py"));
            info.Environment["PYTHONIOENCODING"] = "utf-8";
            info.Environment["OPENAI_MODEL"] = Environment.GetEnvironmentVariable("OPENAI_MODEL") ?? "gpt-4o-mini-2024-07-18";
            using var process = new Process { StartInfo = info };
            try { process.Start(); }
            catch (System.ComponentModel.Win32Exception) { throw new DomainError(503, "Python could not start. Set PYTHON_EXECUTABLE to a Python 3.11+ executable."); }
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancel);
            deadline.CancelAfter(TimeSpan.FromSeconds(35));
            using var registration = deadline.Token.Register(() => { TryStop(process); });
            var output = process.StandardOutput.ReadToEndAsync(deadline.Token);
            var errors = process.StandardError.ReadToEndAsync(deadline.Token);
            try
            {
                store.ReserveAttempt(Limit);
                await process.StandardInput.WriteAsync(Wire.Pack(new { brief = store.Competition.Brief, criteria = store.Competition.Criteria, paragraphs = entry.Submission.Paragraphs }).AsMemory(), deadline.Token);
                process.StandardInput.Close();
                await process.WaitForExitAsync(deadline.Token);
                var raw = await output;
                _ = await errors;
                if (raw.Length > 100000) throw new DomainError(502, "The analysis exceeded the response limit. Nothing was saved.");
                WorkerResult result;
                try { result = Wire.Read<WorkerResult>(raw); }
                catch (System.Text.Json.JsonException) { throw new DomainError(502, "The review worker returned an unreadable result. Nothing was saved."); }
                if (process.ExitCode != 0 || result.Error is not null || result.Content is null || string.IsNullOrWhiteSpace(result.Model) || result.PromptVersion != Rules.PromptVersion)
                    throw new DomainError(502, result.Error ?? "The review worker could not complete the analysis. Nothing was saved.");
                cancel.ThrowIfCancellationRequested();
                return store.SaveReview(id, revision, result.Content, result.Model);
            }
            catch (OperationCanceledException) when (!cancel.IsCancellationRequested)
            { throw new DomainError(504, "The analysis timed out. Your submission and scorecard are unchanged; you can try again."); }
            finally
            {
                if (!TryStop(process))
                    throw new DomainError(503, "The review worker could not shut down. Restart the local server before another analysis.");
                using var shutdown = new CancellationTokenSource(TimeSpan.FromSeconds(3));
                try { await process.WaitForExitAsync(shutdown.Token); }
                catch (OperationCanceledException)
                { throw new DomainError(503, "The review worker did not shut down in time. Restart the local server before another analysis."); }
                try { await Task.WhenAll(output, errors); }
                catch (OperationCanceledException) { }
            }
        }
        finally { gate.Release(); }
    }
}
