import { Module } from '@nestjs/common';
import { RfqController } from './rfq.controller';

@Module({
  controllers: [RfqController],
})
export class RfqModule {}
