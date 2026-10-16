-- ---------------------------------------------------------------------------
-- Preuves de livraison stockées.
--
-- Migration purement additive : aucune colonne existante n'est modifiée ni
-- supprimée. Les preuves déjà référencées par `missions."proofId"` restent
-- lisibles ; le nouveau contrôle de clôture ne s'applique qu'aux identifiants
-- réellement fournis à partir de maintenant.
-- ---------------------------------------------------------------------------

CREATE TABLE "proof_files" (
  "id"               TEXT         NOT NULL,
  "companyId"        TEXT         NOT NULL,
  "missionId"        TEXT         NOT NULL,
  "type"             "ProofType"  NOT NULL DEFAULT 'PHOTO',

  "mimeType"         TEXT         NOT NULL,
  "sizeBytes"        INTEGER      NOT NULL,
  "sha256"           TEXT         NOT NULL,
  "storageKey"       TEXT         NOT NULL,

  "uploadedByUserId" TEXT,
  "recipientName"    TEXT,
  "note"             TEXT,
  "latitude"         DOUBLE PRECISION,
  "longitude"        DOUBLE PRECISION,

  "clientId"         TEXT,
  "recordedAt"       TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"        TIMESTAMP(3),

  CONSTRAINT "proof_files_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "proof_files_companyId_fkey" FOREIGN KEY ("companyId")
    REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "proof_files_missionId_fkey" FOREIGN KEY ("missionId")
    REFERENCES "missions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "proof_files_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId")
    REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  -- Une preuve vide n'est pas une preuve.
  CONSTRAINT "proof_files_size_positive" CHECK ("sizeBytes" > 0)
);

CREATE UNIQUE INDEX "proof_files_storageKey_key" ON "proof_files" ("storageKey");
CREATE UNIQUE INDEX "proof_files_clientId_key" ON "proof_files" ("clientId");
-- Deux dépôts du même contenu pour la même mission désignent la même preuve.
CREATE UNIQUE INDEX "proof_files_companyId_missionId_sha256_key"
  ON "proof_files" ("companyId", "missionId", "sha256");
CREATE INDEX "proof_files_companyId_missionId_idx" ON "proof_files" ("companyId", "missionId");
