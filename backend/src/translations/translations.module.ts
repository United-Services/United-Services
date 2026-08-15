import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { TranslationService } from './translation.service';
import { LibreTranslateClient } from './libretranslate.client';

// Standalone module so it's reusable if another content type (see
// TranslatableContentType) is ever added beyond OpenPosition.
@Module({
  imports: [PrismaModule, RedisModule],
  providers: [TranslationService, LibreTranslateClient],
  exports: [TranslationService],
})
export class TranslationsModule {}
