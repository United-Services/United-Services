import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreatePositionDto, UpdatePositionDto } from './dto/position.dto';
import { Role, type User } from '../generated/prisma';

@Controller('positions')
export class PositionsController {
  constructor(private readonly prisma: PrismaService) {}

  // Public Careers page — only ever shows isOpen positions.
  @Public()
  @Get()
  listOpen() {
    return this.prisma.openPosition.findMany({ where: { isOpen: true }, orderBy: { createdAt: 'desc' } });
  }

  @Roles(Role.admin)
  @Get('all')
  listAll() {
    return this.prisma.openPosition.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Roles(Role.admin)
  @Post()
  create(@CurrentUser() admin: User, @Body() dto: CreatePositionDto) {
    return this.prisma.openPosition.create({ data: { ...dto, createdByAdminId: admin.id } });
  }

  @Roles(Role.admin)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePositionDto) {
    return this.prisma.openPosition.update({ where: { id }, data: dto });
  }
}
