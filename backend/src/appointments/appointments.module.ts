import { Module } from '@nestjs/common';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsGateway } from './appointments.gateway';

@Module({
  controllers: [AppointmentsController],
  providers: [AppointmentsGateway],
})
export class AppointmentsModule {}
