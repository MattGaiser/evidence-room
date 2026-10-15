# Evidence Room

A submission review workbench that helps a judge trace findings to source evidence, ask useful clarification questions, and record an independent recommendation.

**Try it: [evidence-room-gaiser.web.app](https://evidence-room-gaiser.web.app)**

Open a submission, check its evidence against four criteria, enter your own scores, then export the complete case packet. AI can organize evidence; it never fills in scores or selects an outcome. Three fictional water-access proposals illustrate measured results, unconventional approaches, and unsupported claims.

![The review workspace keeps original submission passages beside source-linked findings.](docs/review-workspace.png)

This is an independent work sample inspired by the XPRIZE Prize Execution Platform role. It has no affiliation with XPRIZE and uses no competitor data or official competition rubric.

## Run locally

Requires Node.js **22.19+**, **.NET 10 SDK**, and **Python 3.11+** on PATH. On Windows the launcher also checks the standard x64 .NET install location. Run these commands from this directory:

```sh
npm ci
npm run build
npm start
```

Open **[http://127.0.0.1:5194](http://127.0.0.1:5194)**. Keep the terminal running. The public demo runs on Firebase Hosting with its API on Cloud Run; see [deployment](docs/deployment.md).

On Windows, stop the running server before `npm run build` or `npm run check`; Windows locks assemblies while they are in use. Use `npm run dev` alongside the API for frontend changes.

Start with **Tidewell Collective → Review the evidence**. Review one criterion at a time using Previous/Next or the criterion selector. The queue hides during review; **Show review queue** reopens it. Each quotation includes a **Why this matters** note explaining its relevance and limitations. Click a quotation to highlight its source in yellow, then use **Back to finding** to return. **Review & score** puts a score beside each criterion's evidence. Select a score, then use Next criterion; the selector shows which criteria are scored. **Recommendation** summarizes those scores and collects your rationale and outcome. Edit score returns to that criterion's evidence. Scores and recommendation edits save automatically. Wait for All changes saved before closing the browser; switching submissions and exporting finish pending saves for you. Finalization requires the complete scorecard and confirmation. Hover or focus unavailable Finalize to highlight missing fields in red and see links to complete them; tapping guides you to the first missing requirement. Export downloads JSON containing the rubric, all submission versions and analyses, saved assessment, and event history.

The default workspace needs no API key. Its analyses are labeled **Example analysis**. New submissions can be reviewed manually. Data persists in `.local/evidence.sqlite`; restarting the server retains it. To start a separate workspace, set `EVIDENCE_DB` to a new SQLite file before starting.

## Optional live AI

Set `OPENAI_API_KEY` in the server process environment, then restart `npm start`. The key stays on the server. Never put it in a `VITE_` variable or commit an environment file. Clicking **Run AI analysis** sends the selected submission and rubric to OpenAI and incurs provider charges.

| Setting               | Default                                  | Purpose                                                              |
| --------------------- | ---------------------------------------- | -------------------------------------------------------------------- |
| `OPENAI_MODEL`        | `gpt-5.6-terra`                          | Structured-output model; alternatives must support the same contract |
| `EVIDENCE_AI_LIMIT`   | `10`                                     | Durable total request-attempt allowance for this database; 0–100     |
| `EVIDENCE_DISABLE_AI` | unset                                    | Set to `1` to disable live requests                                  |
| `PYTHON_EXECUTABLE`   | `python` on Windows, `python3` elsewhere | Worker executable                                                    |
| `EVIDENCE_DB`         | `.local/evidence.sqlite`                 | SQLite file location                                                 |

The default is [GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra), using strict structured output and reasoning effort `none` for this bounded extraction task. The Python worker owns the default; `OPENAI_MODEL` remains an explicit override. Older model overrides receive no unsupported reasoning parameter.

One analysis runs at a time. Each attempted request consumes an allowance slot, including failures and cancellations; restarting does not reset it. There are no automatic paid retries. Provider requests have a 30-second timeout, enclosed by a 35-second worker deadline. An invalid quotation, refusal, malformed result, timeout, or stale submission leaves the previous saved analysis intact. Cancellation can still incur a provider charge; canceling after the server commits does not undo an already saved review.

## Verify

```sh
npx playwright install --with-deps
npm run check
```

The default suite needs no paid account. It includes .NET storage/domain tests, Python provider-contract tests, and Chromium/Firefox/WebKit workflow and accessibility checks. Each browser test launches an isolated API with live AI disabled and a temporary database, using ports 5195 and above by worker. Tests clean up their own processes and storage. `npm run check` also runs lint, formatting, TypeScript, and release builds.

Real Python subprocess tests cover timeout, cancellation, unexpected exit, overlap, and failed shutdown. Compatibility tests pass actual .NET input through the Python worker with a local provider fixture and validate the emitted result in .NET. Browser runtime schemas infer the TypeScript contracts and reject malformed successful responses without falsely acknowledging unsaved work.

Optional paid verification is separate:

```sh
npm run test:live -- --confirm-paid
```

It makes up to three small provider requests through a running local server, including one prompt-injection case, and checks persisted exports. It writes ignored results under `.local/`. Only run it with the key owner's approval. These checks verify persisted analyses, exact source quotations, per-quote explanations, and independent human assessments. They do not benchmark general judging accuracy.

## Design and handoff

- [Review specification](docs/review-spec.md): scope and observable acceptance criteria.
- [Firebase and Cloud Run deployment](docs/deployment.md): public URL, durable storage, startup notice, limits, and update steps.
- [Architecture](docs/architecture.md): ownership, transactions, AI trust boundary, and deployment requirements.
- [Product decisions](docs/product-decisions.md): workflow, interaction system, and source research.
- [Interface system](docs/design-system.md): XPRIZE colors, shared tokens, component ownership, and copy rules.
- [Extending the review workflow](docs/extending-reviews.md): reusable spec-driven change process and test map.

The stack is React/TypeScript, ASP.NET Core, SQLite, and a Python Responses API worker. Run `npm run dev` for the Vite frontend on port 5193 alongside the API on 5194; rebuild before using the compiled frontend again.

The public demo is a shared example workspace with a fixed illustrative rubric and no individual accounts. Changes are visible to other visitors; use synthetic examples only. Saved work and the shared AI allowance persist across Cloud Run restarts. Local execution retains loopback-only access. It does not implement judge assignment, multi-judge consensus, file ingestion, or prize disbursement. Handling private competitor submissions would require authentication, authorization, organization isolation, and a reviewed data-retention policy. Exact quotation validation proves text provenance; the judge still evaluates interpretation and scientific credibility.
