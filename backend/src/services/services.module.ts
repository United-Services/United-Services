import { Module } from '@nestjs/common';
import { ServicesController } from './services.controller';
import { TranslationsModule } from '../translations/translations.module';

@Module({
  imports: [TranslationsModule],
  controllers: [ServicesController],
})
export class ServicesModule {}
