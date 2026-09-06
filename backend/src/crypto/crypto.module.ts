import { Global, Module } from '@nestjs/common';
import { KekKeyStore } from './kek-key-store.service';
import { KekRotationService } from './kek-rotation.service';
import { KekRotationWorker } from './kek-rotation.worker';
import { KekSsmBackup } from './kek-ssm-backup.service';
import { TotpCryptoService } from './totp-crypto.service';

@Global()
@Module({
  providers: [
    KekSsmBackup,
    KekKeyStore,
    TotpCryptoService,
    KekRotationService,
    KekRotationWorker,
  ],
  exports: [KekKeyStore, TotpCryptoService, KekRotationService],
})
export class CryptoModule {}
