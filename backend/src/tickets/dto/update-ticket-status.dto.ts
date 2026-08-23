import { IsIn } from 'class-validator';

export class UpdateTicketStatusDto {
  @IsIn(['unresolved', 'contacted', 'resolved'])
  status!: 'unresolved' | 'contacted' | 'resolved';
}
