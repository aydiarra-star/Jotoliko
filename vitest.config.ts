import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
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
