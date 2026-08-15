import {
  Body,
  ConflictException,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateSlotDto } from './dto/create-slot.dto';
import { BookSlotDto } from './dto/book-slot.dto';
import { UpdateSlotDto } from './dto/update-slot.dto';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto';
import { fuzzyMatch, searchableText } from '../common/utils/fuzzy-match';
import { Role, type User } from '../generated/prisma';

@Controller('appointments')
export class AppointmentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  @Roles(Role.admin)
  @Post('slots')
  createSlot(@CurrentUser() admin: User, @Body() dto: CreateSlotDto) {
    return this.prisma.appointmentSlot.create({
      data: {
        date: new Date(dto.date),
        startTime: new Date(dto.startTime),
        endTime: new Date(dto.endTime),
        createdByAdminId: admin.id,
      },
    });
  }

  // Only open, non-closed slots are ever listed here — a booked or
  // admin-closed slot simply disappears rather than rendering disabled.
  // See docs/BUSINESS_RULES.md rule 4.
  @Get('slots')
  openSlots() {
    return this.prisma.appointmentSlot.findMany({
      where: {
        isBooked: false,
        isClosed: false,
        date: { gte: new Date(new Date().toDateString()) },
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
  }

  @Roles(Role.admin)
  @Get('slots/all')
  allSlots() {
    return this.prisma.appointmentSlot.findMany({
      orderBy: [{ date: 'desc' }, { startTime: 'asc' }],
      include: {
        appointment: {
          include: {
            client: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
                companyName: true,
              },
            },
          },
        },
      },
    });
  }

  // Editing date/time is only meaningful before the slot is booked (the
  // client already saw the original time otherwise), but closing is
  // allowed regardless of isBooked — an admin may want to hide a slot
  // that's already booked from ever being offered again once it's freed
  // up (e.g. via a cancellation).
  @Roles(Role.admin)
  @Patch('slots/:id')
  async updateSlot(
    @CurrentUser() admin: User,
    @Param('id') id: string,
    @Body() dto: UpdateSlotDto,
  ) {
    const updated = await this.prisma.appointmentSlot.update({
      where: { id },
      data: {
        ...(dto.date && { date: new Date(dto.date) }),
        ...(dto.startTime && { startTime: new Date(dto.startTime) }),
        ...(dto.endTime && { endTime: new Date(dto.endTime) }),
        ...(dto.isClosed !== undefined && { isClosed: dto.isClosed }),
      },
    });
    await this.auditLog.record({
      actorUserId: admin.id,
      action: 'appointment_slot.updated',
      targetType: 'AppointmentSlot',
      targetId: id,
      metadata: { ...dto },
    });
    return updated;
  }

  // Booking is a single conditional update guarded on isBooked=false inside
  // a transaction — this is what prevents two clients racing to book the
  // same slot (see docs/BUSINESS_RULES.md rule 4).
  @Roles(Role.client)
  @Post('book')
  async book(@CurrentUser() client: User, @Body() dto: BookSlotDto) {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.appointmentSlot.updateMany({
        where: { id: dto.slotId, isBooked: false },
        data: { isBooked: true },
      });
      if (count === 0)
        throw new ConflictException(
          'This slot was just booked by someone else — please pick another.',
        );

      return tx.appointment.create({
        data: { slotId: dto.slotId, clientId: client.id },
        include: { slot: true },
      });
    });
  }

  @Roles(Role.client)
  @Get('mine')
  mine(@CurrentUser() client: User) {
    return this.prisma.appointment.findMany({
      where: { clientId: client.id },
      orderBy: { createdAt: 'desc' },
      include: { slot: true },
    });
  }

  // Fuzzy-matched in-app — see fuzzy-match.ts and the equivalent note on
  // AdminUsersController.list.
  @Roles(Role.admin)
  @Get()
  async list(@Query('q') q?: string) {
    const appointments = await this.prisma.appointment.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        slot: true,
        client: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            companyName: true,
          },
        },
      },
    });
    if (!q) return appointments;
    return appointments.filter((a) =>
      fuzzyMatch(
        searchableText(
          a.client.firstName,
          a.client.lastName,
          a.client.companyName,
        ),
        q,
      ),
    );
  }

  // "done" (client showed up) / "cancelled" (admin called it off) — see
  // UpdateAppointmentStatusDto. Deliberately leaves the underlying slot's
  // isBooked/isClosed alone: an admin who wants that time slot offered
  // again closes/edits it separately via PATCH /appointments/slots/:id.
  @Roles(Role.admin)
  @Patch(':id/status')
  async updateStatus(
    @CurrentUser() admin: User,
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentStatusDto,
  ) {
    const updated = await this.prisma.appointment.update({
      where: { id },
      data: { status: dto.status },
    });
    await this.auditLog.record({
      actorUserId: admin.id,
      action: 'appointment.status_updated',
      targetType: 'Appointment',
      targetId: id,
      metadata: { status: dto.status },
    });
    return updated;
  }
}
