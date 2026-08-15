import { IsIn } from 'class-validator';

// Admin-only transition, separate from the client-facing booking flow —
// "done" records the client showed up, "cancelled" records the admin
// called it off. Never "booked" here: that's only ever the creation
// default, not something to transition back into.
export class UpdateAppointmentStatusDto {
  @IsIn(['done', 'cancelled'])
  status!: 'done' | 'cancelled';
}
