import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTicketDto } from './create-ticket.dto';

// TicketsController.create() is @Public() and rate-limited to just 5/min
// specifically because it's the most exposed, least-authenticated abuse
// surface in the app — anyone on the internet can POST arbitrary text
// here. TicketsController.spec.ts's controller-level tests call
// controller.create() directly and so bypass Nest's global ValidationPipe
// entirely; this file instead runs class-validator's validate() the same
// way the real pipe would, to confirm the @MaxLength guards on name/
// details actually reject oversized adversarial payloads rather than that
// being an assumption nothing exercises.
describe('CreateTicketDto validation', () => {
  const validPayload = {
    name: 'Jane',
    email: 'jane@example.com',
    company: 'Acme',
    type: 'technical' as const,
    details: 'It broke',
  };

  function validateDto(overrides: Partial<typeof validPayload>) {
    const instance = plainToInstance(CreateTicketDto, {
      ...validPayload,
      ...overrides,
    });
    return validate(instance);
  }

  it('accepts a well-formed payload with no violations', async () => {
    const errors = await validateDto({});
    expect(errors).toHaveLength(0);
  });

  // name is capped at 120 chars (see create-ticket.dto.ts) — without this,
  // an adversarial caller could stuff megabytes of text into a single
  // field on an unauthenticated endpoint.
  it('rejects a name longer than 120 characters', async () => {
    const errors = await validateDto({ name: 'a'.repeat(121) });
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('accepts a name exactly at the 120 character boundary', async () => {
    const errors = await validateDto({ name: 'a'.repeat(120) });
    expect(errors.some((e) => e.property === 'name')).toBe(false);
  });

  // details is capped at 2000 chars — the largest free-text field on this
  // wide-open endpoint, so the one most worth confirming actually rejects
  // an oversized submission instead of silently accepting and writing an
  // arbitrarily large row.
  it('rejects details longer than 2000 characters', async () => {
    const errors = await validateDto({ details: 'a'.repeat(2001) });
    expect(errors.some((e) => e.property === 'details')).toBe(true);
  });

  it('accepts details exactly at the 2000 character boundary', async () => {
    const errors = await validateDto({ details: 'a'.repeat(2000) });
    expect(errors.some((e) => e.property === 'details')).toBe(false);
  });

  // Unicode/emoji content must not be rejected — it's ordinary, legitimate
  // input for a public support form, not something @MaxLength (which
  // counts JS string length/UTF-16 code units, same as user-perceived
  // "characters" closely enough for this bound) should treat specially.
  it('accepts unicode/emoji content within the length limits', async () => {
    const errors = await validateDto({
      name: '日本語テスト 🎉🔥 Ñoño',
      details: 'Emoji stress test: 😀😃😄🚀💥 — 中文测试 — मानक',
    });
    expect(errors).toHaveLength(0);
  });

  // HTML/script-shaped input isn't the backend's concern to reject — see
  // TicketsController.spec.ts's comment on the same point. It only needs
  // to pass class-validator's checks like any other string.
  it('accepts HTML/script-shaped content within the length limits', async () => {
    const errors = await validateDto({
      name: '<script>alert(1)</script>',
      details: '"><img src=x onerror=alert(1)>\' OR 1=1; --',
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects an invalid email', async () => {
    const errors = await validateDto({ email: 'not-an-email' });
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  it('rejects a type outside the allowed enum values', async () => {
    const errors = await validateDto({ type: 'made_up_type' as any });
    expect(errors.some((e) => e.property === 'type')).toBe(true);
  });
});
