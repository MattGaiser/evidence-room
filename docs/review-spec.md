# Submission review contract

## User and outcome

A round reviewer needs to understand what an entry actually demonstrates, identify questions for the team, and record a defensible recommendation. Evidence Room covers one fictional water-access round with a versioned, weighted rubric. It does not select prize winners.

## Acceptance criteria

1. Intake creates an entry and an immutable first submission version. Revisions require the expected version; concurrent changes return 409 without overwriting work.
2. Every analysis records the submission version, rubric version, prompt version, source, model, and creation time. A later submission version cannot inherit the old analysis or assessment.
3. Python accepts exactly one finding for each rubric criterion. A supporting citation must match a verbatim passage in that submission. Missing evidence has no fabricated citation. Unsupported paragraph IDs, duplicate criteria, malformed output, refusals, and incomplete responses fail closed.
4. Submission text is untrusted data. It cannot add tools, override the rubric, supply system instructions, or finalize an assessment. Unconventional approaches are evaluated against the rubric rather than conformity to an expected solution.
5. AI findings provide evidence and questions. Numeric scores are entered independently by a person. The server computes the weighted total; the browser cannot supply its own total.
6. Draft scorecards persist with optimistic concurrency. Final recommendations require every score, a rationale, an outcome, and confirmation of independent review. Final records are immutable.
7. Export reads the entry, versions, rubric, analyses, assessments, and audit events in one database transaction.
8. A missing provider key, timeout, canceled request, or invalid output leaves the submission and scorecard unchanged. The interface offers an accurate recovery action and retains typed work.
9. Seeded examples work without a key and are labeled example analyses. Real generation is an explicit action. Default tests never use a paid provider.
10. The queue, evidence links, forms, dialogs, and scorecard work with a keyboard and at narrow and short viewports. Feedback names the result of every non-obvious action.

## Scope

One local reviewer workspace; synthetic entries; plaintext passages; .NET API and SQLite persistence; React UI; Python AI boundary. Accounts, organization permissions, file extraction, adjudication across multiple judges, payouts, and public hosting are separate work. The authored rubric is illustrative and does not reproduce official XPRIZE scoring rules.
