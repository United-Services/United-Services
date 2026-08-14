// @clerk/backend does one real thing we can't do in a test process: make a
// network call to Clerk's servers to verify a session token. That's the
// only boundary mocked in these e2e tests — everything on our side of it
// (ClerkAuthGuard's DB lookup, RolesGuard, MfaEnrolledGuard,
// CsrfHeaderGuard, controllers, Prisma) runs for real.
//
// The trick: verifyToken() is mocked to treat whatever bearer token string
// it's given AS the clerkId directly (`sub: token`). So to "authenticate
// as" a seeded test user, just send `Authorization: Bearer <that user's
// clerkId>` — no real Clerk token needed. Each e2e spec file needs:
//
//   jest.mock('@clerk/backend', () =>
//     require('./utils/clerk-mock').mockClerkBackend(),
//   );
//
// at the very top (before other imports) — require(), not an imported
// binding, since jest.mock() factories are hoisted above the file's
// imports and referencing an already-imported function there throws
// "Cannot access before initialization".
export function mockClerkBackend() {
  return {
    verifyToken: (token: string) => Promise.resolve({ sub: token }),
    createClerkClient: () => ({
      users: {
        getUser: () => {
          throw new Error(
            'getUser() should never be reached in these e2e tests — every test user is pre-seeded in Postgres, so ClerkAuthGuard should never hit its self-heal path',
          );
        },
        updateUser: () => Promise.resolve({}),
      },
    }),
  };
}

export function bearerFor(clerkId: string) {
  return { Authorization: `Bearer ${clerkId}` };
}
