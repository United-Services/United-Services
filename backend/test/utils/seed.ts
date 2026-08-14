import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { Role } from '../../src/generated/prisma';

// Every field defaults to something unique per call (randomUUID-suffixed)
// so parallel/sequential test files sharing one ephemeral CI database
// never collide on the unique clerkId/email constraints.
export function createUser(
  prisma: PrismaService,
  overrides: Partial<{
    role: Role;
    mfaEnrolled: boolean;
    companyName: string | null;
  }> = {},
) {
  const id = randomUUID();
  return prisma.user.create({
    data: {
      clerkId: `test-clerk-${id}`,
      email: `test-${id}@use-eg.test`,
      firstName: 'Test',
      lastName: 'User',
      role: overrides.role ?? Role.client,
      mfaEnrolled: overrides.mfaEnrolled ?? false,
      companyName: overrides.companyName ?? null,
    },
  });
}
