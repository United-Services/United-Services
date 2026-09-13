import { Injectable, OnModuleDestroy } from '@nestjs/common';
import {
  Registry,
  collectDefaultMetrics,
  Counter,
  Histogram,
  Gauge,
} from 'prom-client';

// Central Prometheus registry for this process. A dedicated Registry
// (not prom-client's global `register`) so nothing else importing
// prom-client elsewhere in the dependency tree can silently add or
// clash with metric names registered here.
//
// What this does NOT cover: host-level hardware (CPU/RAM/disk of the
// machine this process runs on) — that's node_exporter's job, scraped
// as its own Prometheus target (see prometheus/prometheus.yml). This
// registry only covers metrics that require being *inside* the Node
// process to know: per-route HTTP latency, BullMQ queue depth, and
// process-level figures (heap, event loop lag, active handles) that
// collectDefaultMetrics() below provides — a closer, earlier signal
// than host-level RAM/CPU for "this specific app is under load," since
// event loop lag and queue backlog rise before the host's own CPU/mem
// necessarily crosses any threshold.
@Injectable()
export class MetricsService implements OnModuleDestroy {
  readonly registry = new Registry();

  readonly httpRequestDuration: Histogram<'method' | 'route' | 'status_code'>;
  readonly httpRequestsTotal: Counter<'method' | 'route' | 'status_code'>;
  readonly httpRequestsInFlight: Gauge<string>;
  readonly queueDepth: Gauge<'queue' | 'state'>;

  constructor() {
    collectDefaultMetrics({ register: this.registry });

    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds, labeled by method/route/status_code',
      labelNames: ['method', 'route', 'status_code'],
      // Tuned around this app's own measured baseline (see
      // backend/loadtest/README.md: p95 ~6-20ms warm-cache locally) up
      // through the range where the site was found to degrade under
      // load (load test: errors start ~250 concurrent, p95 climbs past
      // 300ms) — buckets are only useful if they bracket the actual
      // range of real observed latencies.
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry],
    });

    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total HTTP requests, labeled by method/route/status_code',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });

    // Instantaneous concurrency — this is the earliest, most direct
    // "how much traffic is hitting this process right now" signal
    // available, well before a rolling rate calculation over scraped
    // counters would show it. See the traffic-detection discussion this
    // module ships alongside for why both this AND httpRequestsTotal's
    // rate matter (one is instantaneous, the other is throughput).
    this.httpRequestsInFlight = new Gauge({
      name: 'http_requests_in_flight',
      help: 'Number of HTTP requests currently being handled',
      registers: [this.registry],
    });

    // One gauge per (queue, state) pair rather than a Queue-derived
    // Gauge subtype — see MetricsService.recordQueueDepths(), invoked on
    // a short interval by QueueMetricsPoller. A growing `waiting` count
    // for analytics-write specifically is a direct signal that
    // AnalyticsWriteWorker's limiter (20 jobs/sec) is the bottleneck,
    // not Supabase itself — useful to tell apart from a genuine hardware
    // saturation event.
    this.queueDepth = new Gauge({
      name: 'bullmq_queue_depth',
      help: 'BullMQ job counts by queue and state (waiting/active/failed/delayed)',
      labelNames: ['queue', 'state'],
      registers: [this.registry],
    });
  }

  async metrics(): Promise<string> {
    return this.registry.metrics();
  }

  get contentType(): string {
    return this.registry.contentType;
  }

  onModuleDestroy() {
    this.registry.clear();
  }
}
