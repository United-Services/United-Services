import { IsEnum } from 'class-validator';
import { ServiceRequestStatus } from '../../generated/prisma';

export class UpdateRfqStatusDto {
  @IsEnum(ServiceRequestStatus)
  status!: ServiceRequestStatus;
}
