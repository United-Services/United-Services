import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

// This filter is the last line of defense against leaking a stack trace
// or raw error message (e.g. a Postgres constraint violation) into an API
// response — a real information-disclosure risk, not just a UX concern.
describe('AllExceptionsFilter', () => {
  function makeHost() {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ method: 'GET', url: '/api/v1/whatever' }),
      }),
    } as unknown as ArgumentsHost;
    return { host, status, json };
  }

  it('passes an HttpException through with its own status and body untouched', () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = makeHost();

    filter.catch(new BadRequestException('bad input'), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'bad input' }),
    );
  });

  it('never leaks a raw error message for an unexpected (non-Http) exception', () => {
    const filter = new AllExceptionsFilter();
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

  it('still returns a safe generic body even when the thrown value is not an Error at all', () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = makeHost();

    filter.catch('a raw string throw', host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Internal server error',
    });
  });
});
