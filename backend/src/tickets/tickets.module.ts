import { Module } from '@nestjs/common';
import { TicketsController } from './tickets.controller';
import { TicketArchiveService } from './ticket-archive.service';
import { TicketArchiveWorker } from './ticket-archive.worker';

@Module({
  controllers: [TicketsController],
  providers: [TicketArchiveService, TicketArchiveWorker],
})
export class TicketsModule {}
