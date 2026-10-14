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
11. Evidence review displays one criterion with Previous/Next and direct selection. Page buttons focus a visible heading even after expanding long content; the native selector retains keyboard focus. Assessment pages preserve scores and rationale in both directions and provide a route to missing scores.
12. Evidence status uses a written label and icon as well as color. Status text and yellow quotation highlights meet a 4.5:1 text contrast ratio in the rendered interface. Automated axe checks and manual browser inspection cover the tested workflow states.
13. Starting evidence review or scoring hides the entire queue column. Reopening restores the filter and preserves unsaved work; selecting another submission still requires resolving unsaved changes. Choosing a score opens the next unscored section without stealing radio-group focus or closing the current section.
14. Source inspection includes Back to finding, restoring focus to the triggering quotation. Changing criteria or workflow steps clears previous highlights and their return actions.

## Scope

One local reviewer workspace; synthetic entries; plaintext passages; .NET API and SQLite persistence; React UI; Python AI boundary. Accounts, organization permissions, file extraction, adjudication across multiple judges, payouts, and public hosting are separate work. The authored rubric is illustrative and does not reproduce official XPRIZE scoring rules.
