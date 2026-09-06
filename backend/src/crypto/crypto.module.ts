import { Global, Module } from '@nestjs/common';
import { KekKeyStore } from './kek-key-store.service';
import { KekSsmBackup } from './kek-ssm-backup.service';
import { TotpCryptoService } from './totp-crypto.service';

@Global()
@Module({
  providers: [KekSsmBackup, KekKeyStore, TotpCryptoService],
  exports: [KekKeyStore, TotpCryptoService],
})
export class CryptoModule {}
