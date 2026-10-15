-- Jeton de reprise à usage de possession : stocker uniquement son empreinte.
-- Migration additive, aucune donnée existante supprimée ou réécrite.
ALTER TABLE "signup_attempts" ADD COLUMN "resumeTokenHash" TEXT;
CREATE UNIQUE INDEX "signup_attempts_resumeTokenHash_key"
  ON "signup_attempts" ("resumeTokenHash");
