// Mirrors the Prisma enums in backend/prisma/schema.prisma — the frontend
// has no access to the generated Prisma client, so these are kept in sync
// by hand rather than imported.
export enum Role {
  Client = "client",
  Candidate = "candidate",
  Admin = "admin",
}

export enum FileAccessStatus {
  Pending = "pending",
  Approved = "approved",
  Denied = "denied",
}

export enum ApplicationStatus {
  Pending = "pending",
  Approved = "approved",
  Denied = "denied",
}

export enum AppointmentStatus {
  Booked = "booked",
  Done = "done",
  Cancelled = "cancelled",
}
