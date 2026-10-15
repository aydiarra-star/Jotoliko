import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BillingModule } from "../billing/billing.module";
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
  imports: [AuthModule, BillingModule],
  controllers: [ProofsController],
  providers: [
    ProofsService,
    {
      provide: ProofStorage,
      useFactory: () => {
        const config = loadConfig();
        return new ProofStorage(config.proofStorageDir, config.proofStorageMinFreeBytes);
      },
    },
  ],
  // Exporté pour la sonde de disponibilité : l'espace du volume de preuves est
  // une condition de service, pas un détail d'implémentation.
  exports: [ProofStorage],
})
export class ProofsModule {}
