import { Body, ConflictException, Controller, Get, Post, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateSlotDto } from './dto/create-slot.dto';
import { BookSlotDto } from './dto/book-slot.dto';
import { Role, type User } from '../generated/prisma';

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly prisma: PrismaService) {}

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

  // Only open slots are ever listed here — a booked slot simply disappears
  // rather than rendering disabled. See docs/BUSINESS_RULES.md rule 4.
  @Get('slots')
  openSlots() {
    return this.prisma.appointmentSlot.findMany({
      where: { isBooked: false, date: { gte: new Date(new Date().toDateString()) } },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
  }

  @Roles(Role.admin)
  @Get('slots/all')
  allSlots() {
    return this.prisma.appointmentSlot.findMany({
      orderBy: [{ date: 'desc' }, { startTime: 'asc' }],
      include: { appointment: { include: { client: { select: { firstName: true, lastName: true, email: true, companyName: true } } } } },
    });
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
      if (count === 0) throw new ConflictException('This slot was just booked by someone else — please pick another.');

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

  @Roles(Role.admin)
  @Get()
  list(@Query('q') q?: string) {
    return this.prisma.appointment.findMany({
      where: q
        ? {
            client: {
              OR: [
                { firstName: { contains: q, mode: 'insensitive' } },
                { lastName: { contains: q, mode: 'insensitive' } },
                { companyName: { contains: q, mode: 'insensitive' } },
              ],
            },
          }
        : {},
      orderBy: { createdAt: 'desc' },
      include: { slot: true, client: { select: { firstName: true, lastName: true, email: true, companyName: true } } },
    });
  }
}
