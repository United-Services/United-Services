import { Module } from '@nestjs/common';
import { PositionsController } from './positions.controller';
import { CandidatesController } from './candidates.controller';

@Module({
  controllers: [PositionsController, CandidatesController],
})
export class CandidatesModule {}
