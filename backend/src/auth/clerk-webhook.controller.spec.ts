import { BadRequestException } from '@nestjs/common';
import { ClerkWebhookController } from './clerk-webhook.controller';
import { Role } from '../generated/prisma';
import type { PrismaService } from '../prisma/prisma.service';

const verifyMock = jest.fn();
jest.mock('svix', () => ({
  Webhook: jest.fn().mockImplementation(() => ({ verify: (...args: unknown[]) => verifyMock(...args) })),
}));

// This is the ONLY place in the app a user's role is ever set from Clerk
// data (docs/BUSINESS_RULES.md) — every other read goes back through our
// own User table. Getting signature verification or the role/email
// extraction wrong here is a direct privilege-escalation or account-
// takeover risk, so it's tested independent of the real svix network call.
describe('ClerkWebhookController', () => {
  let prisma: { user: any };
  let controller: ClerkWebhookController;
  const headers = { 'svix-id': 'id', 'svix-timestamp': 't', 'svix-signature': 's' };

  beforeEach(() => {
    verifyMock.mockReset();
    prisma = { user: { upsert: jest.fn().mockResolvedValue({}) } };
    controller = new ClerkWebhookController(prisma as unknown as PrismaService);
    process.env.CLERK_WEBHOOK_SECRET = 'whsec_test';
  });

  it('rejects when CLERK_WEBHOOK_SECRET is not configured', async () => {
    delete process.env.CLERK_WEBHOOK_SECRET;
    await expect(controller.handle({ rawBody: Buffer.from('{}') }, headers)).rejects.toThrow(BadRequestException);
  });

  it('rejects a request with no raw body', async () => {
    await expect(controller.handle({}, headers)).rejects.toThrow(BadRequestException);
  });

  it('rejects when svix signature verification fails', async () => {
    verifyMock.mockImplementation(() => {
      throw new Error('bad signature');
    });
    await expect(controller.handle({ rawBody: Buffer.from('{}') }, headers)).rejects.toThrow(BadRequestException);
    expect(prisma.user.upsert).not.toHaveBeenCalled();
  });

  it('creates a client-role user on user.created with no public_metadata.role', async () => {
    verifyMock.mockReturnValue({
      type: 'user.created',
      data: {
        id: 'clerk-1',
        email_addresses: [{ id: 'em1', email_address: 'client@co.com' }],
        primary_email_address_id: 'em1',
        first_name: 'Ann',
        last_name: 'Client',
        unsafe_metadata: { companyName: 'Acme' },
      },
    });

    await controller.handle({ rawBody: Buffer.from('{}') }, headers);

    expect(prisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ role: Role.client, email: 'client@co.com', companyName: 'Acme' }),
      }),
    );
  });

  it('assigns admin role only when Clerk public_metadata explicitly says so', async () => {
    verifyMock.mockReturnValue({
      type: 'user.created',
      data: {
        id: 'clerk-2',
        email_addresses: [{ id: 'em1', email_address: 'admin@use-eg.com' }],
        primary_email_address_id: 'em1',
        first_name: 'Ad',
        last_name: 'Min',
        public_metadata: { role: Role.admin },
      },
    });

    await controller.handle({ rawBody: Buffer.from('{}') }, headers);

    expect(prisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ role: Role.admin }) }),
    );
  });

  it('never re-derives role on user.updated — update payload has no role field at all', async () => {
    verifyMock.mockReturnValue({
      type: 'user.updated',
      data: {
        id: 'clerk-1',
        email_addresses: [{ id: 'em1', email_address: 'client@co.com' }],
        primary_email_address_id: 'em1',
        first_name: 'Ann',
        last_name: 'Client',
        public_metadata: { role: Role.admin }, // even if present, must be ignored on update
      },
    });

    await controller.handle({ rawBody: Buffer.from('{}') }, headers);

    const updatePayload = prisma.user.upsert.mock.calls[0][0].update;
    expect(updatePayload).not.toHaveProperty('role');
  });

  it('rejects when the Clerk payload has no primary email', async () => {
    verifyMock.mockReturnValue({
      type: 'user.created',
      data: { id: 'clerk-3', email_addresses: [], primary_email_address_id: 'missing', first_name: '', last_name: '' },
    });

    await expect(controller.handle({ rawBody: Buffer.from('{}') }, headers)).rejects.toThrow(BadRequestException);
  });

  it('ignores event types other than user.created/user.updated without touching the DB', async () => {
    verifyMock.mockReturnValue({ type: 'session.created', data: {} });
    const result = await controller.handle({ rawBody: Buffer.from('{}') }, headers);
    expect(result).toEqual({ received: true });
    expect(prisma.user.upsert).not.toHaveBeenCalled();
  });
});
