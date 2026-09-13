# Kubernetes: on-demand replication, closed when traffic is low

Closes the gap `backend/prometheus/README.md` flagged: Prometheus can
*detect* a 70%-sustained-load condition, but the previous single-host
`docker-compose.yml` deployment had nothing that could actually act on
it. A `HorizontalPodAutoscaler` (30-backend-hpa.yaml) is that missing
piece — a standard Kubernetes primitive, no custom control loop needed.

**What this does NOT change**: database sharding. This scales the
stateless backend API layer (more pods behind the `backend` Service),
not Postgres. See `backend/prometheus/README.md`'s "consistent-hash
sharding is for stateful data" section — that reasoning is unchanged;
this is the API-replica-count half of the original question, not the
sharding half.

## Files, in apply order (the numeric prefixes match)

| File | What |
|---|---|
| `00-namespace.yaml` | `use-backend` namespace |
| `01-metrics-server.yaml` | Only needed if the cluster doesn't already have metrics-server (Docker Desktop's Kubernetes doesn't) — the HPA's CPU/memory percentages come from here |
| `10-postgres.yaml` | Local standby Postgres (FailoverService's fallback target — same role as `docker-compose.yml`'s `postgres`, never the primary) |
| `11-redis.yaml` | Local standby Redis, same role as `docker-compose.yml`'s `redis` |
| `20-backend-configmap.yaml` | Non-secret env |
| `21-backend-secret.example.yaml` | **Template only** — copy to `21-backend-secret.yaml` (gitignored) and fill in real values, or use CI-style placeholders for a smoke test (see below) |
| `22-backend-deployment.yaml` | The backend app — `resources.requests` is what makes the HPA's "70%" mean anything |
| `23-backend-service.yaml` | ClusterIP in front of the backend pods |
| `30-backend-hpa.yaml` | The actual autoscaler |

## Running it

```sh
cd backend/k8s
kubectl apply -f 00-namespace.yaml
kubectl apply -f 01-metrics-server.yaml   # skip if metrics-server already exists
cp 21-backend-secret.example.yaml 21-backend-secret.yaml
# fill in 21-backend-secret.yaml with real values (never commit it — see .gitignore)
kubectl apply -f 10-postgres.yaml -f 11-redis.yaml -f 20-backend-configmap.yaml -f 21-backend-secret.yaml -f 22-backend-deployment.yaml -f 23-backend-service.yaml -f 30-backend-hpa.yaml
```

Watch it work:

```sh
kubectl -n use-backend get hpa backend --watch
# TARGETS shows current/target %, e.g. "23%/70%, 12%/70%" — if it shows
# "<unknown>/70%" instead, metrics-server isn't running/reachable yet.
```

## Why `minReplicas: 1`, not `0`

You asked for "closed when traffic is less" — this gets as close as
standard Kubernetes autoscaling can: at idle, exactly 1 pod runs (the
same footprint as today's single-instance deployment, so normal traffic
costs nothing extra). Scaling all the way to **zero** pods (nothing
running at all when there's no traffic) needs a request-triggered
activator that can catch an incoming request, spin a pod up, and hold
the request until it's ready — that's what
[KEDA](https://keda.sh)'s `ScaledObject` or
[Knative Serving](https://knative.dev) add on top of plain Kubernetes.
Worth adding as a follow-up if idle-cost matters enough to justify it
(both add real operational complexity — another controller to run and
understand), but it's a distinct, bigger step from "autoscale between 1
and N," which is what's built here.

## Local smoke test (Docker Desktop's Kubernetes, no real secrets)

To verify the Deployment/Service/HPA mechanics actually work — not to
run real traffic against real data — use the same placeholder-credential
pattern this repo's own CI already uses for the backend integration
test job (`.github/workflows/ci.yml`):

```yaml
# 21-backend-secret.yaml, smoke-test-only values:
AWS_ACCESS_KEY_ID: "ci-placeholder"
AWS_SECRET_ACCESS_KEY: "ci-placeholder"
AWS_REGION: "us-east-1"
APP_ENV: "staging"
# BACKEND_POSTGRES_PASSWORD / BACKEND_REDIS_PASSWORD / LOCAL_DATABASE_URL
# / LOCAL_REDIS_URL: any value, self-consistent with 10-postgres.yaml/
# 11-redis.yaml — see 21-backend-secret.example.yaml's own comment.
#
# Also required — learned the hard way in a live run: fetch-secrets.mjs
# deliberately never fails hard when SSM is unreachable (see its own
# comment), so a placeholder AWS credential just logs a warning and
# exports nothing, meaning DATABASE_URL/CLERK_SECRET_KEY etc. never get
# set at all and `prisma migrate deploy` fails fast on a missing
# DATABASE_URL. CI's own backend-integration job sidesteps this
# entirely by never going through docker-entrypoint.sh/SSM and setting
# these directly (see .github/workflows/ci.yml) — do the same here:
DATABASE_URL: "postgresql://united_services:<BACKEND_POSTGRES_PASSWORD>@postgres:5432/united_services"
DIRECT_URL: "postgresql://united_services:<BACKEND_POSTGRES_PASSWORD>@postgres:5432/united_services"
REDIS_URL: "redis://:<BACKEND_REDIS_PASSWORD>@redis:6379"
CLERK_SECRET_KEY: "sk_test_ci-placeholder-key"
WEBAUTHN_RP_ID: "localhost"
WEBAUTHN_RP_ORIGIN: "http://localhost:3000"
CORS_ORIGINS: "http://localhost:3000"
S3_BUCKET_NAME: "ci-placeholder-bucket"
```

This will not reach Supabase (the SSM-secrets fetch will fail, since
`ci-placeholder` isn't a real AWS credential) — it proves pods schedule,
the readiness probe against `/api/v1/health` behaves, and the HPA reacts
to load, without touching anything real. Don't route real traffic at a
deployment configured this way.

### Getting a locally-built image into Docker Desktop's Kubernetes

Docker Desktop's kind-mode node runs its own containerd image store,
separate from the classic `docker build` image store, by default — a
freshly `docker build`'t image is invisible to `kubectl` even with
`imagePullPolicy: IfNotPresent`, failing with `ErrImagePull`/
`ImagePullBackOff` referencing `docker.io/library/<image>` (it silently
tries to resolve the tag as a Docker Hub repository). Fix: Docker
Desktop → Settings → General → enable **"Use containerd for pulling and
storing images"** → Apply & Restart, then rebuild the image (an image
built *before* enabling this setting stays in the old store and needs
rebuilding to land in the new shared one). This restarts Docker Desktop
entirely, including every other running container — expect a few
minutes of downtime cluster-wide. After that, `docker build -t
<image>:local .` + `kubectl set image deployment/<name> <container>=
<image>:local` + `imagePullPolicy: IfNotPresent` works with no
registry needed.

## Generating CPU load to see it scale (smoke test only)

```sh
kubectl -n use-backend run load-generator --image=busybox --restart=Never -- \
  /bin/sh -c "while true; do wget -q -O- http://backend:3002/api/v1/health; done"
```

Watch `kubectl -n use-backend get hpa backend --watch` — replicas should
climb as CPU crosses 70%, then `kubectl delete pod load-generator` and
watch it scale back down to 1 after the 5-minute scale-down
stabilization window (`30-backend-hpa.yaml`'s `behavior.scaleDown`).

**Verified live** (2026-09-13, Docker Desktop kind cluster): idle at 1
replica / ~6% CPU, scaled to 4 replicas under a sustained busybox
`wget` loop (peaked at 218%/70% CPU), then back down to 1 replica ~6
minutes after the load generator was deleted, with the HPA's own event
log recording `SuccessfulRescale ... reason: All metrics below target`.
Memory was tried as a second HPA metric first and removed after this
same run showed it scale to `maxReplicas` and get stuck there even at
zero traffic — see `30-backend-hpa.yaml`'s comment on why (Node/V8's
baseline RSS reads as sustained high load regardless of actual
traffic). CPU-only is the correct signal for this app.
