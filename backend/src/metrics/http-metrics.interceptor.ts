import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, finalize } from 'rxjs';
import { MetricsService } from './metrics.service';

// Global interceptor (see MetricsModule) — records every HTTP request's
// duration/count/in-flight status, regardless of which controller
// handles it. Deliberately an interceptor, not a middleware: middleware
// runs before Nest resolves the matched route, so req.route (the actual
// pattern, e.g. "/services/:id") isn't available yet — only the raw URL
// is, which would blow up this metric's cardinality with one label
// series per distinct id/slug ever requested instead of one per route
// shape. An interceptor runs after routing, so the resolved route
// pattern is already on the request.
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const route = this.routeLabel(req);
    const method = req.method;

    this.metrics.httpRequestsInFlight.inc();
    const stopTimer = this.metrics.httpRequestDuration.startTimer({
      method,
      route,
    });

    return next.handle().pipe(
      // finalize() fires on both success and error (a thrown exception
      // propagates through the observable's error channel, but
      // AllExceptionsFilter has already set res.statusCode by the time
      // this runs) — one place records both paths instead of needing a
      // separate error handler.
      finalize(() => {
        const statusCode = String(res.statusCode);
        stopTimer({ status_code: statusCode });
        this.metrics.httpRequestsTotal.inc({
          method,
          route,
          status_code: statusCode,
        });
        this.metrics.httpRequestsInFlight.dec();
      }),
    );
  }

  // req.route.path is only populated once Nest's router has matched a
  // handler — true by the time an interceptor runs. @types/express
  // types Request.route as `any`, so a cast straight onto Request would
  // just inherit that `any` rather than narrowing it — going through
  // `unknown` first fully replaces it with this explicit, narrow shape.
  // Falls back to the raw path for the small number of cases with no
  // matched route (a 404), labeled distinctly so those don't silently
  // merge into route "undefined".
  private routeLabel(req: Request): string {
    const routePath = (req as unknown as { route?: { path?: string } }).route
      ?.path;
    if (routePath) return routePath;
    return req.path ? `${req.path} (unmatched)` : 'unmatched';
  }
}
