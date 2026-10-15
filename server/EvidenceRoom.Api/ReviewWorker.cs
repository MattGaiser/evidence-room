using System.Diagnostics;

namespace EvidenceRoom;

public sealed class ReviewWorker
{
    private readonly SemaphoreSlim gate = new(1, 1);
    private readonly RuntimeSettings settings;
    private readonly Store store;
    private readonly TimeSpan timeout;
    private readonly Func<Process, bool> stop;
    private volatile bool healthy = true;
    public bool Healthy => healthy;

    public ReviewWorker(RuntimeSettings settings, Store store) : this(settings, store, TimeSpan.FromSeconds(35)) { }

    // Tests shorten the real process deadline and can reproduce an uncertain shutdown.
    internal ReviewWorker(RuntimeSettings settings, Store store, TimeSpan timeout, Func<Process, bool>? stop = null)
    {
        this.settings = settings;
        this.store = store;
        this.timeout = timeout;
        this.stop = stop ?? TryStop;
    }
    private static bool TryStop(Process process)
    {
        try { if (!process.HasExited) process.Kill(entireProcessTree: true); return true; }
        catch (InvalidOperationException) { return true; }
        catch (System.ComponentModel.Win32Exception) { return false; }
        catch (AggregateException) { return false; }
    }
    public bool Available => settings.AiConfigured && Healthy;
    public int Limit => settings.AiAttemptLimit;

    public async Task<EntryDetail> Run(string id, int revision, CancellationToken cancel)
    {
        if (!settings.AiConfigured) throw new DomainError(503, "AI is not configured. You can use the example analyses or score the entry manually.");
        if (!await gate.WaitAsync(0, cancel)) throw new DomainError(429, "Another analysis is running. Try again when it finishes.");
        try
        {
            if (!Healthy) throw new DomainError(503, "The review worker could not shut down. Restart the server before another analysis.");
            var entry = store.Get(id);
            if (entry.Entry.Revision != revision) throw new DomainError(409, "The submission changed. Reload it before running the analysis.");
            if (entry.Assessment?.Finalized == true) throw new DomainError(409, "This recommendation is final. Submit a revision to start another review.");
            cancel.ThrowIfCancellationRequested();
            var executable = settings.PythonExecutable;
            var root = settings.Root;
            var info = new ProcessStartInfo(executable) { RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = root };
            info.ArgumentList.Add(Path.Combine(root, "worker", "review.py"));
            info.Environment["PYTHONIOENCODING"] = "utf-8";
            using var process = new Process { StartInfo = info };
            try { process.Start(); }
            catch (System.ComponentModel.Win32Exception) { throw new DomainError(503, "Python could not start. Set PYTHON_EXECUTABLE to a Python 3.11+ executable."); }
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancel);
            deadline.CancelAfter(timeout);
            using var registration = deadline.Token.Register(() => { stop(process); });
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
                var result = ReviewWorkerResult.Parse(raw, process.ExitCode);
                cancel.ThrowIfCancellationRequested();
                return store.SaveReview(id, revision, result.Content, result.Model);
            }
            catch (OperationCanceledException) when (!cancel.IsCancellationRequested)
            { throw new DomainError(504, "The analysis timed out. Your submission and scorecard are unchanged; you can try again."); }
            catch (IOException cause)
            {
                cancel.ThrowIfCancellationRequested();
                if (deadline.IsCancellationRequested)
                    throw new DomainError(504, "The analysis timed out. Your submission and scorecard are unchanged; you can try again.");
                throw new DomainError(502, "The review worker stopped before completing the analysis. Nothing was saved.", cause, "review-process-io");
            }
            finally
            {
                using var shutdown = new CancellationTokenSource(TimeSpan.FromSeconds(3));
                if (!stop(process)) healthy = false;
                else
                {
                    try { await process.WaitForExitAsync(shutdown.Token); }
                    catch (OperationCanceledException) { healthy = false; }
                }
                if (!Healthy) deadline.Cancel();
                var streams = Task.WhenAll(output, errors);
                try { await streams.WaitAsync(shutdown.Token); }
                catch (OperationCanceledException)
                {
                    if (!streams.IsCompleted)
                    {
                        healthy = false;
                        // Observe a late pipe fault without holding the request indefinitely.
                        _ = streams.ContinueWith(completed => { _ = completed.Exception; },
                            CancellationToken.None, TaskContinuationOptions.OnlyOnFaulted | TaskContinuationOptions.ExecuteSynchronously, TaskScheduler.Default);
                    }
                }
                catch (IOException) { }
                if (!Healthy)
                    throw new DomainError(503, "The review worker could not shut down. Restart the server before another analysis.");
            }
        }
        finally { gate.Release(); }
    }
}
