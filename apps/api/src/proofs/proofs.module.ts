import { Module } from "@nestjs/common";
import { ProofsController } from "./proofs.controller";
import { ProofsService } from "./proofs.service";
import { ProofStorage } from "./proof-storage";
import { loadConfig } from "../config";

/**
 * Le stockage est construit depuis la configuration validée, pas depuis
 * `process.env` : un répertoire de preuves mal configuré doit être détecté au
 * démarrage (voir `main.ts`).
 */
export const PROOF_STORAGE = "JOTOLIKO_PROOF_STORAGE";

@Module({
  controllers: [ProofsController],
  providers: [
    ProofsService,
    {
      provide: ProofStorage,
      useFactory: () => new ProofStorage(loadConfig().proofStorageDir),
    },
  ],
})
export class ProofsModule {}
