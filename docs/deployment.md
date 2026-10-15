# Firebase Hosting and Cloud Run

The public demo is **[evidence-room-gaiser.web.app](https://evidence-room-gaiser.web.app)** in the existing `codeforcanada` Google Cloud project. Its dedicated Firebase site is `evidence-room-gaiser`; the Lab Bench deployment is separate.

[Firebase Hosting](https://firebase.google.com/docs/hosting/cloud-run) serves the compiled React app independently of the backend. Only `/api/**` forwards to the `evidence-room` Cloud Run service in `us-central1`. A delayed first connection shows a prominent Cloud Run warm-up message after 1.5 seconds; it waits up to 45 seconds and opens automatically when ready. Errors offer retry, and unknown case URLs offer a route back to the example workspace.

## Resources

| Resource                | Name                                                          |
| ----------------------- | ------------------------------------------------------------- |
| Cloud Run service       | `evidence-room`, `us-central1`                                |
| Runtime identity        | `evidence-room-runtime@codeforcanada.iam.gserviceaccount.com` |
| API-key secret          | `evidence-room-openai-key`, version `1`                       |
| Private snapshot bucket | `codeforcanada-evidence-room-state`                           |
| Snapshot object         | `workspace.sqlite`                                            |

The runtime identity has access only to this secret and object operations in this bucket. The API key is injected into the runtime environment, never a build argument or frontend variable. Source upload allowlists omit credentials, local databases, test output, and caches. The container runs as the .NET image's non-root application user and includes Python for the review worker.

## Runtime configuration

| Setting                    | Value / purpose                                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `PUBLIC_ORIGINS`           | Exact HTTPS origins for this site's `.web.app` and `.firebaseapp.com` addresses and the service's Cloud Run addresses |
| `EVIDENCE_SNAPSHOT_BUCKET` | `codeforcanada-evidence-room-state`                                                                                   |
| `EVIDENCE_AI_LIMIT`        | `25` total attempts, shared across visitors                                                                           |
| `OPENAI_API_KEY`           | Secret Manager mapping                                                                                                |
| `PORT`, `K_SERVICE`        | Supplied by Cloud Run                                                                                                 |
| `VITE_HOSTED_DEMO`         | `1` at frontend build time to enable the Cloud Run startup wording                                                    |

Cloud Run uses zero minimum instances, a service and revision maximum of one instance, concurrency eight, one CPU, 512 MiB memory, and a 55-second request timeout. HTTP startup and liveness probes use `/health`; an uncertain storage write makes liveness fail so the instance restores from durable storage. [Cloud Run health checks](https://docs.cloud.google.com/run/docs/configuring/healthchecks) restart unhealthy containers. Firebase's rewrite deadline is 60 seconds.

This is a shared synthetic workspace without individual accounts. Its storage and AI allowance persist across restarts and deployments. New submissions and revisions have optimistic concurrency checks; finalized versions remain locked. An Origin header is not authentication. Do not enter confidential competitor data.

## Persistence and limits

SQLite runs locally inside the container. Every successful mutation, including an AI reservation, uploads a standalone backup to the private bucket using a [generation precondition](https://docs.cloud.google.com/storage/docs/request-preconditions). The API acknowledges a write only after storage confirms it. Active SQLite/WAL files are never mounted on Cloud Storage. A conflicting or uncertain upload stops the workspace until restart; automatic paid retries are disabled.

The public allowance is 25 total provider attempts, not 25 per visitor or per restart. Failed and canceled attempts consume a slot. Keep the existing snapshot when redeploying: removing it resets both workspace and allowance. Allowance replenishment or a reset is an explicit owner operation.

The shared demo permits at most 50 entries, 10 versions per entry, and an 8 MiB snapshot. A capacity rejection preserves existing reads and exports. Draft-save audit events retain the latest per version. These caps limit demo storage and provider attempts; they are not a dollar budget or a cap on infrastructure charges.

## Updating the deployment

Run the normal unpaid checks and build the hosted frontend:

```powershell
npm ci
npm run check
$env:VITE_HOSTED_DEMO = '1'
npx vite build
Remove-Item Env:\VITE_HOSTED_DEMO
```

The checked-in `cloud-run.yaml` records the complete service configuration and current image digest. To apply that configuration, use `gcloud run services replace cloud-run.yaml --project codeforcanada --region us-central1`; update the image digest when publishing a different build. Initial public invocation requires `roles/run.invoker` for `allUsers` on this demo service.

Stop the local server before `npm run check` on Windows. Build the backend container with the checked-in Dockerfile, then update the configured service while preserving its environment, secret, identity, probes, and instance settings:

```sh
gcloud run deploy evidence-room --source . --project codeforcanada --region us-central1
firebase deploy --only hosting --project codeforcanada
```

The Firebase CLI uses its own login. The [Hosting REST deployment API](https://firebase.google.com/docs/hosting/api-deploy) also accepts the existing gcloud access token with the `x-goog-user-project: codeforcanada` header; no new user login is required when that authorized token remains valid.

After deployment, check the homepage, hashed assets, CSP and cache headers, same-origin API rewrites, missing/foreign-origin rejection, quote-to-source navigation, scoring/autosave/export, and delayed startup recovery. Default tests never call a paid provider; any additional live-provider verification requires the key owner's authorization. See [architecture](architecture.md) for commit boundaries and the brief stale-read window during overlapping revisions.
