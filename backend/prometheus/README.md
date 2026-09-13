# Hardware & performance monitoring

Prometheus + Grafana + node_exporter, scraping this backend's own
`/metrics` (see `../src/metrics/`) and the host's hardware. This README
covers what's actually running, then the traffic-detection/threshold/
scaling design questions this was built to answer.

## Running it

```sh
cd backend/prometheus
export METRICS_TOKEN=<same value the backend process's METRICS_TOKEN env var uses>
export GRAFANA_ADMIN_PASSWORD=<pick one>
docker compose -f docker-compose.monitoring.yml up -d
```

- Prometheus: <http://localhost:9090> (targets: <http://localhost:9090/targets>)
- Grafana: <http://localhost:3001> (admin / $GRAFANA_ADMIN_PASSWORD) — the
  "USE Backend — Hardware & Performance" dashboard is auto-provisioned,
  nothing to import manually.

Both ports are bound to `127.0.0.1` only — this is an operator-facing
dashboard, not something meant to be reachable from the public internet.
Tunnel in (`ssh -L 3001:localhost:3001 ...`) rather than exposing it.

What's on the dashboard: CPU/memory/disk utilization, load average, HTTP
requests/sec by route, p50/p95/p99 latency, HTTP error rate, requests
in-flight, BullMQ queue depth per queue, Node.js event loop lag, and
process memory (RSS/heap) — see `dashboards/hardware-performance.json`.

## How this detects "high traffic," and why 70%

Two independent things have to both be true before this calls something
"high traffic," not just "the host is busy":

1. **Hardware saturation** — CPU or memory utilization above 70%,
   *sustained* for 3 consecutive minutes (`alerts/high-load.rules.yml`'s
   `for: 3m`). Not instantaneous: a single 15s scrape crossing 70% is
   normal noise (a GC pause, a burst of requests finishing in the same
   tick) and would make the alert flap constantly if it fired
   immediately. Requiring 3 straight minutes above the line is standard
   practice for exactly this reason (it's the same shape AWS Auto
   Scaling and Kubernetes HPA use — a cooldown/sustained-breach window,
   not a raw instantaneous threshold).

2. **A real increase in request rate** — the app's own
   `http_requests_total` rate is at least 2x what it was an hour ago
   (`HighTrafficLoad`'s alert expression). This is what actually tells
   apart "real traffic is driving the hardware number up" from
   "something else on this host is eating CPU" — a backup job, a
   neighboring process, a runaway cron, a memory leak with no traffic
   involved at all. Hardware saturation *alone* (`HighHardwareLoad`)
   only means "go look at the dashboard," never "go scale" — only
   `HighTrafficLoad`, which requires both conditions together, is
   specific enough to justify an automated action.

### Why 70%, specifically

70% leaves real headroom for the actual traffic *causing* the alert to
keep growing while a human (or automation) reacts — at 90%+ a sudden
additional burst has nowhere to go and starts queuing/timing out before
anything can respond. It's also comfortably below where this app's own
load testing found real degradation starting: the load test in this
repo's history found the very first errors appearing around 250
concurrent connections locally, well past what 70% CPU on a
single-instance dev machine corresponds to in practice — so 70% fires
*before* the point already measured to matter, not after.

70% is a reasonable starting point, not a number this app's real traffic
has validated yet — **this whole system currently has no evidence it
sees traffic anywhere near this threshold**. Treat it as provisional: run
this dashboard for a few weeks of real traffic, look at what CPU/memory
actually look like on a normal busy day vs. a quiet one, and adjust the
number to match reality rather than a round figure.

### Why BullMQ queue depth is a separate, earlier signal

`QueueBacklogGrowing` (500+ waiting jobs sustained for 5 minutes) exists
because a queue backing up can happen with hardware nowhere near 70% —
e.g. `AnalyticsWriteWorker`'s own rate limiter (20 jobs/sec, a
deliberate ceiling protecting Supabase's connection pooler, not a
capacity limit — see that worker's class comment) would cause
`analytics-write`'s `waiting` count to climb under a traffic burst well
before CPU/memory saturate. That's a real signal worth alerting on, but
it means "the queue's own configured rate limit is being hit," not "add
more replicas" — raising replica count wouldn't change a limiter that's
intentionally capping writes to protect a shared downstream resource.

## On automatic replication + consistent-hash sharding

You asked for: at 70%, replicate automatically; never replicate without
sharding; shard evenly via consistent hashing. Before building that,
two things are worth being direct about — one is a capability gap in
what's actually deployed today, the other is a scope question about
whether sharding is the right tool here at all.

### 1. This stack has no orchestrator to actually replicate anything

Prometheus/Alertmanager can *detect* the 70% condition and fire a
webhook — that part is real and buildable. But firing a webhook is not
the same as a new backend instance existing: something has to actually
provision compute, start the container, register it with a load
balancer, and health-check it before traffic can reach it. That's what
an orchestrator does (Kubernetes' HPA, an AWS Auto Scaling Group + ALB,
Docker Swarm's service scaling, ECS). The current deployment
(`docker-compose.yml` at the repo root) is a single-host stack with no
such layer — `docker compose up --scale backend=3` on one machine adds
CPU contention on the same box, not more capacity, and there's nothing
here yet that could provision a *second* machine on its own.

Building that from scratch (a custom control loop watching Prometheus
and calling a cloud provider's API to launch a new host) is a real,
non-trivial project in itself — before deciding to build it, it's worth
first running this dashboard against real traffic and confirming the
70% condition is something that actually happens. Provisional
recommendation: wire `HighTrafficLoad` to a page/Slack alert first (a
human decides whether to scale) rather than an automated action,
until there's real data showing this is a recurring condition worth
automating around.

### 2. Consistent-hash sharding is for stateful data, not a stateless API

This matters for whether "shard by hashing users evenly" is even the
right next step once replication is possible. This backend is
stateless — auth is a Clerk session token verified per-request, not
in-process session state, and nothing about a request depends on which
replica handles it. For a stateless API, plain load balancing (round
robin or least-connections, which any load balancer already does) is
sufficient and evenly distributes users on its own — no hashing needed,
and no correctness reason to route the same user to the same replica
every time.

Consistent hashing earns its complexity when you're partitioning
*stateful* data across multiple independent stores — e.g. splitting the
Postgres database itself into shards, where a given user's rows have to
consistently land in the same shard for queries to work at all. That's
the scenario a library like `hashring`/`node-consistent-hash` (evenly
distributing keys, minimal remapping when a shard is added/removed) is
built for. But sharding the actual database is a materially bigger
project than replicating a stateless API: it means picking a shard key,
splitting the schema, rewriting every query that currently assumes one
database into "route to the right shard," and handling any query that
needs to span shards (the admin dashboard's aggregate counts, for
instance, currently a handful of `Promise.all([...])` calls against one
Postgres instance — see `AnalyticsController.computeOverview()` — would
become a fan-out-and-merge across N shards).

Given this app's real measured capacity (load testing this session
found ~750 req/s clean throughput on a single dev-machine instance,
already comfortably above what a company site like this actually sees),
sharding the database is very likely solving a scale problem this app
doesn't have yet. If replicating the *stateless API layer* (no sharding
needed) turns out to be insufficient once there's real traffic data,
that's the point to revisit database sharding specifically — not before.

### What's actually built right now, and what's next

Built: the dashboard, the 70%-sustained alert (hardware-only and
traffic-corroborated variants), the queue-backlog alert, and the
recording rules everything above is expressed in terms of.

Not yet wired: an Alertmanager receiver (Slack/PagerDuty/ntfy — this
repo already has `IncidentAlertService`/ntfy for other alerts, worth
reusing rather than adding a second alerting channel) so `HighTrafficLoad`
actually notifies someone, and — deliberately, per the above — no
automated replication or sharding action behind it yet. Recommend:
watch this dashboard against real traffic first, then revisit whether
replication is worth automating (and if so, which orchestrator to add)
once there's actual evidence of the 70% condition recurring.
