import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Les suites « reality » partagent une même base PostgreSQL lorsqu'une
    // DATABASE_URL externe est fournie (CI). Exécutées en parallèle, elles se
    // recréent mutuellement le schéma et échouent de façon trompeuse. La suite
    // complète dure quelques secondes : la séquentialité ne coûte rien.
    fileParallelism: false,

    // Les tests portent sur le code source. Sans cette restriction, vitest
    // ramasse le JavaScript compilé (apps/api/dist) et exécute des copies de
    // tests déjà compilées — échecs incompréhensibles et résultats dupliqués.
    include: ["lib/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**", "out/**", "apps/**/dist/**"],
    environment: "node",
    // Les tests base de données appliquent une migration réelle : ils ont
    // besoin d'un délai supérieur au défaut.
    testTimeout: 30_000,
    hookTimeout: 120_000,
    reporters: ["default"],
  },
});
