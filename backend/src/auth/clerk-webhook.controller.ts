import { BadRequestException, Controller, Headers, Post, Req } from '@nestjs/common';
import { Webhook } from 'svix';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../../generated/prisma';

interface ClerkUserPayload {
  id: string;
  email_addresses: { id: string; email_address: string }[];
  primary_email_address_id: string;
  first_name: string | null;
  last_name: string | null;
  phone_numbers?: { phone_number: string }[];
  public_metadata?: { role?: Role; companyName?: string };
}

// Syncs Clerk's user.created / user.updated events into our own User table.
// This is the only place a role is ever assigned from Clerk metadata — every
// other part of the app reads the role back out of this table, never off a
// live Clerk claim (see docs/BUSINESS_RULES.md).
@Controller('webhooks/clerk')
export class ClerkWebhookController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Post()
  async handle(@Req() req: { rawBody?: Buffer }, @Headers() headers: Record<string, string>) {
    const secret = process.env.CLERK_WEBHOOK_SECRET;
    if (!secret) throw new BadRequestException('Webhook not configured');
    if (!req.rawBody) throw new BadRequestException('Missing raw body');

    const webhook = new Webhook(secret);
    let event: { type: string; data: ClerkUserPayload };
    try {
      event = webhook.verify(req.rawBody, {
        'svix-id': headers['svix-id'],
        'svix-timestamp': headers['svix-timestamp'],
        'svix-signature': headers['svix-signature'],
      }) as { type: string; data: ClerkUserPayload };
    } catch {
      throw new BadRequestException('Invalid webhook signature');
    }

    if (event.type === 'user.created' || event.type === 'user.updated') {
      const data = event.data;
      const primaryEmail = data.email_addresses.find((e) => e.id === data.primary_email_address_id)?.email_address;
      if (!primaryEmail) throw new BadRequestException('No primary email on Clerk user');

      await this.prisma.user.upsert({
        where: { clerkId: data.id },
        create: {
          clerkId: data.id,
          email: primaryEmail,
          firstName: data.first_name ?? '',
          lastName: data.last_name ?? '',
          phone: data.phone_numbers?.[0]?.phone_number,
          role: data.public_metadata?.role ?? Role.client,
          companyName: data.public_metadata?.companyName,
        },
        update: {
          email: primaryEmail,
          firstName: data.first_name ?? '',
          lastName: data.last_name ?? '',
          phone: data.phone_numbers?.[0]?.phone_number,
        },
      });
    }

    return { received: true };
  }
}
