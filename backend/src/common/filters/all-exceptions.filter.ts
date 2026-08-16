import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { IncidentAlertService } from '../../alerting/incident-alert.service';

// Global safety net (registered as APP_FILTER in app.module.ts). Every
// thrown HttpException (BadRequestException, NotFoundException, etc.)
// still carries its own status/message through untouched — those are
// deliberate, safe-to-show responses. Anything else (a genuinely
// unexpected error — a bug, a DB hiccup, a null-pointer) is logged with
// full detail server-side but only ever returns a generic, non-leaking
// 500 body to the client. This is what stands between an unhandled
// exception and a stack trace or raw DB error message reaching a
// response body.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionsHandler');

  constructor(private readonly incidentAlertService: IncidentAlertService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      // Still log 5xx HttpExceptions (rare, but possible) — 4xx are
      // expected client-driven outcomes and too noisy to log every time.
      if (status >= 500) {
        this.logger.error(
          `${request.method} ${request.url} -> ${status}`,
          exception.stack,
        );
        this.pageOnCall(request, status, exception);
      }
      response.status(status).json(exception.getResponse());
      return;
    }

    const error =
      exception instanceof Error ? exception : new Error(String(exception));
    this.logger.error(
      `${request.method} ${request.url} -> unhandled: ${error.message}`,
      error.stack,
    );
    this.pageOnCall(request, HttpStatus.INTERNAL_SERVER_ERROR, error);

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    });
  }

  // Only ever called for the >=500 branches above — never for expected
  // 4xx outcomes, which would make an on-call page meaningless within a
  // day. Uses the real, unsanitized error message/details for whoever
  // gets paged — a different concern from the sanitized body the actual
  // HTTP client receives above, which must never see this. Fire-and-
  // forget: IncidentAlertService itself never throws, and this must never
  // delay or affect the response already being sent to the client.
  private pageOnCall(request: Request, status: number, exception: Error) {
    void this.incidentAlertService.trigger({
      route: request.route?.path ?? request.url,
      method: request.method,
      statusCode: status,
      errorMessage: exception.message,
      requestId: request.headers['x-request-id'] as string | undefined,
    });
  }
}
