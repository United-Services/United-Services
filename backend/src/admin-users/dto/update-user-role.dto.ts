import { IsEnum } from 'class-validator';
import { Role } from '../../generated/prisma';

export class UpdateUserRoleDto {
  @IsEnum(Role)
  role!: Role;
}
