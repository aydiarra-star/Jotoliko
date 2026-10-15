import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ProofsController } from "./proofs.controller";
import { ProofsService } from "./proofs.service";
import { ProofStorage } from "./proof-storage";
import { loadConfig } from "../config";

/**
 * Le stockage est construit depuis la configuration validée, pas depuis
 * `process.env` : un répertoire de preuves mal configuré doit être détecté au
 * démarrage (voir `main.ts`).
 */
@Module({
  // `AuthModule` exporte AuthGuard, RolesGuard et RoleResolver. Les redéclarer
  // ici dupliquerait ces instances et casserait la résolution des dépendances
  // de la garde — c'est exactement l'erreur de démarrage que les tests ont
  // révélée.
  imports: [AuthModule],
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
