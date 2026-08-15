import { Module } from '@nestjs/common';
import { PositionsController } from './positions.controller';
import { CandidatesController } from './candidates.controller';
import { TranslationsModule } from '../translations/translations.module';

@Module({
  imports: [TranslationsModule],
  controllers: [PositionsController, CandidatesController],
})
export class CandidatesModule {}
