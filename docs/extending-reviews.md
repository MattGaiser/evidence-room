# Extending the review workflow

Use the existing specification, implementation boundaries, and ordinary tests to make a small change reviewable. The goal is a repeatable way to direct and evaluate AI-assisted implementation, rather than generating a large change from a vague feature request.

## Change process

1. Write the user trigger, intended outcome, and failure behavior in `review-spec.md` before implementation. Specify what must persist and which saved versions the operation uses.
2. Identify the owning layer. UI state belongs in React; invariant enforcement and transactions belong in .NET; provider request and output validation belong in Python. Ask an AI coding tool for a bounded patch to that layer, giving the acceptance criteria and relevant existing contracts.
3. Inspect the patch. Check null/type handling, exact identities, stale-write checks, cancellation and cleanup, secret exposure, paid retries, and whether a new abstraction has a real caller. Do not accept generated code based on appearance or compilation alone.
4. Add or adapt the smallest regression that reproduces a plausible failure. Run the affected test, then the normal check command. Use synthetic data and mocked provider responses for default tests.
5. For provider changes, review schema and prompt together. A live check is optional, separately authorized, bounded, and supplementary to deterministic validation. Preserve output labels so authored examples cannot be confused with live results.
6. Review the rendered workflow and request an independent code review. Resolve concrete findings, rerun affected checks, and update setup, screenshots, and limitations to match the final result.

A useful implementation prompt is:

> Implement this acceptance criterion in the existing owner layer: [trigger and result]. Preserve [invariants]. Handle [failure cases]. First identify the affected contracts and relevant tests. Keep the patch focused, do not add dependencies without a concrete need, and explain any change to persisted data or public behavior. Do not make paid provider requests.

## Worked extension: richer clarification questions

Suppose judges need to distinguish **required before pilot** from **follow-up during pilot** questions. First decide whether the distinction is AI-suggested or a human decision. Define allowed values, what happens to existing examples, how exports represent the value, and whether final records can change. Do not add a new field only to the screen.

For an AI-suggested distinction, update the structured schema and Python validator, the .NET review record and validation, synthetic examples, browser schemas in `web/contracts.ts`, and evidence display. Browser types are inferred from those schemas. Extend the Python/.NET process contract cases and browser response tests to detect drift. Add malformed and unknown-value tests, retain exact quotation checks, and increment the prompt version. If stored review JSON changes incompatibly, add an explicit migration or a backward-compatible reader before opening an existing database. Require a judge's confirmation before any suggestion affects a final recommendation.

## Test map

| Boundary                                   | Location                                               | Consequences checked                                                                                                                              |
| ------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Submission and assessment rules            | `server/EvidenceRoom.Tests/ReviewTests.cs`             | Immutable versions, exact score keys/ranges, required final fields, weighted totals                                                               |
| SQLite transactions                        | Same .NET suite                                        | Stale submissions and drafts, final locks, durable concurrent allowance, complete exports                                                         |
| Hosted persistence                         | `server/EvidenceRoom.Tests/SnapshotTests.cs`           | Restart recovery, uncertain writes, generation conflicts, capacity rollback, reads waiting for durability                                         |
| Startup and request boundary               | `RuntimeSettingsTests.cs`, `ReviewerHttpTests.cs`      | Invalid configuration, exact host/origin checks, JSON requirements, health and safe diagnostics                                                   |
| Worker process output                      | `server/EvidenceRoom.Tests/ReviewWorkerResultTests.cs` | Malformed envelopes, explicit worker failure, prompt identity, independently validated content                                                    |
| Actual worker process and interoperability | `server/EvidenceRoom.Tests/ReviewWorkerTests.cs`       | Real child cancellation, deadline, overlap, exit, failed cleanup, gate reuse; actual Python output through .NET validation and persistence        |
| Browser response contracts                 | `tests/contracts.spec.ts`                              | Real .NET response compatibility, malformed success recovery, preserved draft without false acknowledgment                                        |
| Provider response and trust contract       | `worker/test_review.py`                                | Invented/wrong-passage quotations, refusals, malformed output, duplicate criteria, missing questions, score injection                             |
| User workflow and HTTP surface             | `tests/workflow.spec.ts`                               | Source links/focus, intake/revision, save/reload/final/export, conflicts, cancellation, keyboard tour, reflow, accessibility, origin restrictions |
| Actual provider integration                | `scripts/live-check.mjs`                               | Real .NET→Python→Responses→validation→SQLite→export path, including injected instructions                                                         |

`npm run check` is the normal handoff command. CI performs the same unpaid checks. Keep live checks outside CI so contributors do not need an API key and a test run cannot silently create charges.

For onboarding, have an engineer trace a single exported review back through its saved analysis and source passages, then make the clarification change above on a branch. Review the contract and a deliberately malformed response before reviewing the final UI. This exercises the failure boundary as well as the happy path.
