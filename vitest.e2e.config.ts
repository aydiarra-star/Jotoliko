import { defineConfig } from "vitest/config";

/**
 * Configuration des tests HTTP de bout en bout.
 *
 * Séparée de `vitest.config.ts` pour une raison simple : ces tests exigent une
 * API **compilée** et un PostgreSQL réel. Les mêler aux tests unitaires rendrait
 * `npm test` dépendant d'une base de données.
 *
 * Aucune imitation n'est utilisée : le serveur est lancé en processus séparé
 * (`node apps/api/dist/apps/api/src/main.js`), avec les vrais gardes, la vraie
 * validation et le vrai client Prisma.
 *
 *   npm run api:build && npm run test:e2e:api
 */
export default defineConfig({
  test: {
    include: ["tests/api-e2e/**/*.e2e.test.ts"],
    environment: "node",
    // Les suites recréent le schéma de la base et la partagent : elles ne
    // peuvent pas s'exécuter en parallèle.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    reporters: ["default"],
  },
});
