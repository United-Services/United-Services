import { Global, Module } from '@nestjs/common';
import { KekKeyStore } from './kek-key-store.service';
import { TotpCryptoService } from './totp-crypto.service';

@Global()
@Module({
  providers: [KekKeyStore, TotpCryptoService],
  exports: [KekKeyStore, TotpCryptoService],
})
export class CryptoModule {}
