import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  /**
   * Délai maximal accordé à la tentative de connexion initiale.
   *
   * Borné volontairement : un démarrage ne doit pas rester suspendu le temps
   * qu'un hôte injoignable finisse de ne pas répondre. Le client reste utilisable
   * et retentera une connexion à la première requête.
   */
  private static readonly CONNECT_ATTEMPT_TIMEOUT_MS = 10_000;

  /**
   * La disponibilité de la base n'est **pas** une condition de démarrage.
   *
   * Choix explicite, et non tolérance : l'API démarre même si PostgreSQL est
   * injoignable, puis se déclare non prête (`/health/ready` → `503`,
   * `checks.database = "unreachable"`). Deux raisons :
   *
   *  - un processus qui sort sur une coupure passagère part en boucle de
   *    redémarrage et ne se rétablit pas seul quand la base revient ;
   *  - la sonde de disponibilité est précisément le mécanisme prévu pour retirer
   *    l'instance du routage tant qu'elle ne peut pas servir. Un processus mort
   *    ne peut rien déclarer — la branche dégradée documentée du contrat serait
   *    inatteignable.
   *
   * La **configuration**, elle, reste bloquante : un secret absent, trop court,
   * une origine CORS implicite ou un répertoire de preuves inutilisable
   * empêchent toujours le démarrage (voir `main.ts` et `config.ts`).
   */
  async onModuleInit(): Promise<void> {
    // La promesse est convertie en résultat pour ne jamais produire de rejet
    // non traité si la tentative aboutit après l'expiration du délai.
    const attempt = this.$connect().then(
      () => "connecte" as const,
      (error: unknown) => ({ erreur: (error as Error).message })
    );
    const timeout = new Promise<"delai">((resolve) => {
      const timer = setTimeout(() => resolve("delai"), PrismaService.CONNECT_ATTEMPT_TIMEOUT_MS);
      timer.unref?.();
    });

    const outcome = await Promise.race([attempt, timeout]);
    if (outcome === "connecte") {
      this.logger.log("Connexion PostgreSQL établie");
      return;
    }

    const cause = outcome === "delai" ? "délai de connexion dépassé" : `base injoignable (${outcome.erreur})`;
    this.logger.error(
      `Connexion PostgreSQL non établie au démarrage : ${cause}. ` +
        "L'API démarre et se déclare non prête : /health/ready renverra 503 tant que la base reste indisponible."
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Sonde de disponibilité utilisée par /health/ready. */
  async ping(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.error(`Sonde base de données en échec : ${(error as Error).message}`);
      return false;
    }
  }
}
