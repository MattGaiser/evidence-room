# Submission review contract

## User and outcome

A round reviewer needs to understand what an entry actually demonstrates, identify questions for the team, and record a defensible recommendation. Evidence Room covers one fictional water-access round with a versioned, weighted rubric. It does not select prize winners.

## Acceptance criteria

1. Intake creates an entry and an immutable first submission version. Revisions require the expected version; concurrent changes return 409 without overwriting work.
2. Every analysis records the submission version, rubric version, prompt version, source, model, and creation time. A later submission version cannot inherit the old analysis or assessment.
3. Python accepts exactly one finding for each rubric criterion. A supporting citation must match a verbatim passage in that submission. Missing evidence has no fabricated citation. Unsupported paragraph IDs, duplicate criteria, malformed output, refusals, and incomplete responses fail closed.
4. Submission text is untrusted data. It cannot add tools, override the rubric, supply system instructions, or finalize an assessment. Unconventional approaches are evaluated against the rubric rather than conformity to an expected solution.
5. AI findings provide evidence and questions. Numeric scores are entered independently by a person. The server computes the weighted total; the browser cannot supply its own total.
6. Draft scorecards autosave with optimistic concurrency; older acknowledgments cannot clear newer edits. Final recommendations require every score, a rationale, an outcome, and confirmation of independent review. Final records are immutable.
7. Export reads the entry, versions, rubric, analyses, assessments, and audit events in one database transaction.
8. A missing provider key, timeout, canceled request, or invalid output leaves the submission and scorecard unchanged. The interface offers an accurate recovery action and retains typed work.
9. Seeded examples work without a key and are labeled example analyses. Real generation is an explicit action. Default tests never use a paid provider.
10. The queue, evidence links, forms, dialogs, and scorecard work with a keyboard and at narrow and short viewports. Feedback names the result of every non-obvious action.
11. Evidence review displays one criterion with Previous/Next and direct selection. Page buttons focus a visible heading even after expanding long content; the native selector retains keyboard focus. Criterion navigation and the recommendation preserve scores and rationale in both directions and provide a route to missing scores.
12. Evidence status uses a written label and icon as well as color. Status text and yellow quotation highlights meet a 4.5:1 text contrast ratio in the rendered interface. Automated axe checks and manual browser inspection cover the tested workflow states.
13. Starting evidence review or scoring hides the entire queue column. Reopening restores the filter and preserves unsaved work; selecting another submission still requires resolving unsaved changes. Choosing a score preserves the current criterion and radio-group focus. Next criterion is an explicit action.
14. Source inspection includes Back to finding, restoring focus to the triggering quotation. Changing criteria or workflow steps clears previous highlights and their return actions.

15. Each criterion is scored beside its evidence, including when no AI analysis exists. Partial drafts preserve valid score 0 and unscored null values. The final recommendation summarizes existing scores; editing or completing a score returns to that criterion's evidence. Finalization makes inline scores read-only.

16. Draft edits save automatically after a short pause, including valid zero and partial scores. Inputs remain editable while a request is pending. Navigation and export drain the latest edits without a routine discard prompt. Failures retain fields and expose recovery with stable keyboard focus.
17. Finalization shares the navigation gate and waits for autosave. Its confirmation cannot dismiss after Record is submitted; a failed preflight closes it and focuses save recovery. Unload protection applies immediately to new edits and pending recording.
18. Unavailable Finalize exposes specific missing requirements on hover, keyboard focus, or touch. Missing fields and scores receive red styling plus associated text, while completed values remain unmarked. Links focus the corresponding field or scoring criterion; blocked activation never records a recommendation. Escape dismisses guidance without losing focus. Unavailable AI actions explain their cause without making a provider request.
19. Each extracted quote has its own concise explanation of its relevance to the criterion and any applicable limitation. The note stays visibly separate from the verbatim quotation, is associated with its source button for assistive technology, persists into export, and never supplies a score. New analyses reject missing or empty explanations. Existing saved reviews remain readable without invented notes; finalized records are unchanged. Unassessed authored examples may receive a new example analysis while retaining their previous version in history.

20. Firebase serves the frontend independently of Cloud Run. Delayed initial connections show a prominent warm-up message after 1.5 seconds, wait up to 45 seconds, and offer retry on failure. Explicit retry, queue navigation, reload, and stale-link recovery focus the loaded destination after its data arrives; passive loading preserves keyboard focus.
21. Hosted storage acknowledges mutations and AI reservations only after a conditional durable snapshot upload. Conflicts and uncertain uploads fail closed; startup restores verified state and quota before serving. Ordinary storage-capacity rejection rolls back while preserving read/export access.
22. The public synthetic workspace is clearly shared, requires configured HTTPS hosts and browser write origins, keeps the key server-side, and bounds entries, revisions, snapshots, and paid attempts. No paid request retries automatically.

## Scope

A local reviewer workspace and a shared public synthetic demo; plaintext passages; .NET API and SQLite persistence; React UI; Python AI boundary. Firebase Hosting serves the frontend and Cloud Run serves the API with durable private snapshots and a shared request allowance. Accounts, organization permissions, confidential competitor data, file extraction, adjudication across multiple judges, and payouts remain outside scope. The authored rubric is illustrative and does not reproduce official XPRIZE scoring rules.
