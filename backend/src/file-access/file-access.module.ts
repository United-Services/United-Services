import { Module } from '@nestjs/common';
import { FileAccessController } from './file-access.controller';

@Module({
  controllers: [FileAccessController],
})
export class FileAccessModule {}
