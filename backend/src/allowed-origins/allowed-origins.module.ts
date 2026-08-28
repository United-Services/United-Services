import { Global, Module } from '@nestjs/common';
import { AllowedOriginsService } from './allowed-origins.service';

// @Global(): configure-app.ts resolves AllowedOriginsService directly via
// app.get() at bootstrap time, before any feature module's own DI scope
// is relevant — same reasoning as AuditLogModule. No controller here —
// deliberately no admin-dashboard/API surface for managing origins; rows
// are added directly in the database. See AllowedOriginsService's class
// comment.
@Global()
@Module({
  providers: [AllowedOriginsService],
  exports: [AllowedOriginsService],
})
export class AllowedOriginsModule {}
