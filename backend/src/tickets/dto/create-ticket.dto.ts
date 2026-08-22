import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateTicketDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsEmail()
  @MaxLength(200)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  company?: string;

  @IsIn(['technical', 'disabled_account', 'non_technical'])
  type!: 'technical' | 'disabled_account' | 'non_technical';

  @IsString()
  @MaxLength(2000)
  details!: string;

  // A pending/tickets/... key from POST /tickets/presign — never trusted
  // as-is, see TicketsController.create().
  @IsOptional()
  @IsString()
  screenshotS3Key?: string;
}
