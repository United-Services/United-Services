import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { TranslationService } from './translation.service';
import { LibreTranslateClient } from './libretranslate.client';
import { TranslationWorker } from '../queue/translation.worker';

// Standalone module so it's reusable if another content type (see
// TranslatableContentType) is ever added beyond OpenPosition.
// TranslationWorker lives here (rather than in QueueModule) since it
// depends on TranslationService directly — QueueModule only ever
// provides generic queue infrastructure (Queue instances), never
// anything that reaches back into a specific domain service.
@Module({
  imports: [PrismaModule, RedisModule],
  providers: [TranslationService, LibreTranslateClient, TranslationWorker],
  exports: [TranslationService],
})
export class TranslationsModule {}
