import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import type { IncidentAlertService } from '../../alerting/incident-alert.service';

// This filter is the last line of defense against leaking a stack trace
// or raw error message (e.g. a Postgres constraint violation) into an API
// response — a real information-disclosure risk, not just a UX concern.
describe('AllExceptionsFilter', () => {
  function makeHost(headers: Record<string, string> = {}) {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({
          method: 'GET',
          url: '/api/v1/whatever',
          headers,
        }),
      }),
    } as unknown as ArgumentsHost;
    return { host, status, json };
  }

  function makeIncidentAlertService() {
    return {
      trigger: jest.fn().mockResolvedValue(undefined),
    } as unknown as IncidentAlertService;
  }

  it('passes an HttpException through with its own status and body untouched', () => {
    const filter = new AllExceptionsFilter(makeIncidentAlertService());
    const { host, status, json } = makeHost();

    filter.catch(new BadRequestException('bad input'), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'bad input' }),
    );
  });

  it('never leaks a raw error message for an unexpected (non-Http) exception', () => {
    const filter = new AllExceptionsFilter(makeIncidentAlertService());
    const { host, status, json } = makeHost();

    filter.catch(
      new Error(
        'duplicate key value violates unique constraint "User_email_key"',
      ),
      host,
    );

    expect(status).toHaveBeenCalledWith(500);
    const body = json.mock.calls[0][0];
    expect(body.message).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('User_email_key');
  });

  it('includes the nginx-generated request id (X-Request-Id) in the 500 body when present, for a user to hand support', () => {
    const filter = new AllExceptionsFilter(makeIncidentAlertService());
    const { host, json } = makeHost({ 'x-request-id': 'abc123def456' });

    filter.catch(new Error('boom'), host);

    expect(json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Internal server error',
      requestId: 'abc123def456',
    });
  });

  it('omits requestId from the body entirely when no X-Request-Id header was sent (never a null/undefined field)', () => {
    const filter = new AllExceptionsFilter(makeIncidentAlertService());
    const { host, json } = makeHost();

    filter.catch(new Error('boom'), host);

    const body = json.mock.calls[0][0];
    expect(body).not.toHaveProperty('requestId');
  });

  it('still returns a safe generic body even when the thrown value is not an Error at all', () => {
    const filter = new AllExceptionsFilter(makeIncidentAlertService());
    const { host, status, json } = makeHost();

    filter.catch('a raw string throw', host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Internal server error',
    });
  });

  // A paged phone that fires for expected 4xx outcomes (a bad request, a
  // 403 from RolesGuard, a 404) would be meaningless noise within a day
  // and get muted — only genuine server faults should ever reach this.
  describe('on-call paging', () => {
    it('never pages for a 4xx HttpException', () => {
      const incidentAlertService = makeIncidentAlertService();
      const filter = new AllExceptionsFilter(incidentAlertService);
      const { host } = makeHost();

      filter.catch(new BadRequestException('bad input'), host);

      expect(incidentAlertService.trigger).not.toHaveBeenCalled();
    });

    it('pages for an unhandled (non-Http) exception, using the real unsanitized message', () => {
      const incidentAlertService = makeIncidentAlertService();
      const filter = new AllExceptionsFilter(incidentAlertService);
      const { host } = makeHost();

      filter.catch(
        new Error(
          'duplicate key value violates unique constraint "User_email_key"',
        ),
        host,
      );

      expect(incidentAlertService.trigger).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          statusCode: 500,
          errorMessage:
            'duplicate key value violates unique constraint "User_email_key"',
        }),
      );
    });

    it('passes the X-Request-Id header through to the on-call page as requestId', () => {
      const incidentAlertService = makeIncidentAlertService();
      const filter = new AllExceptionsFilter(incidentAlertService);
      const { host } = makeHost({ 'x-request-id': 'trace-9988' });

      filter.catch(new Error('boom'), host);

      expect(incidentAlertService.trigger).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: 'trace-9988' }),
      );
    });

    it('pages for a 5xx HttpException too, not just unhandled errors', () => {
      const incidentAlertService = makeIncidentAlertService();
      const filter = new AllExceptionsFilter(incidentAlertService);
      const { host } = makeHost();

      const { InternalServerErrorException } = require('@nestjs/common');
      filter.catch(new InternalServerErrorException('db unreachable'), host);

      expect(incidentAlertService.trigger).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 500 }),
      );
    });
  });
});
