import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  // Clerk enforces its own password policy server-side (length + hacked-
  // password checks) on the updateUser call itself — this is just a
  // sane floor so an obviously-too-short value never reaches that call.
  @IsString()
  @MinLength(8)
  newPassword!: string;
}
