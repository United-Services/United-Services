// JSON.stringify(anError) produces "{}" for a plain Error/DOMException —
// .message, .name, and .stack are all non-enumerable own properties, so
// the default serializer drops every bit of useful information and
// ships a content-free "{}" to Betterstack. Confirmed live: this exact
// gap turned a real WebAuthn registration failure into an undiagnosable
// empty log line. Custom Error subclasses that assign extra properties
// as normal class fields (e.g. @simplewebauthn's WebAuthnError.code) DO
// serialize correctly on their own — this only special-cases the parts
// the default serializer misses, it doesn't replace it.
//
// Shared by both instrumentation.ts (server) and instrumentation-client.ts
// (browser) so a console.error(...) call anywhere in this app — including
// third-party library warnings — always keeps its actual message.
export function serializeForLog(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      ...Object.fromEntries(
        Object.entries(value).filter(([key]) => !["name", "message", "stack"].includes(key)),
      ),
    }
  }
  if (Array.isArray(value)) return value.map(serializeForLog)
  return value
}
