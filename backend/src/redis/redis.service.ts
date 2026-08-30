import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  constructor() {
    // Same fallback as queue.module.ts's BullMQ connections — not a
    // credential, just ioredis's own documented default connection
    // target, and it's what satisfies ioredis's constructor overloads
    // (they don't accept `string | undefined`) without widening
    // REDIS_URL's type at every call site.
    super(process.env.REDIS_URL ?? 'redis://localhost:6379');
  }

  onModuleDestroy() {
    this.disconnect();
  }
}
