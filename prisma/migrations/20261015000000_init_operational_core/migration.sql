-- Migration 0001 — socle multi-entreprise, couche opérationnelle et caisse.
--
-- Portée volontairement explicite :
--   INCLUS   : companies, users, missions, cash_movements, mutation_keys, audit_logs
--              + enums MissionStatus / TruthStatus / CashMovementType
--              + index et contraintes d'unicité nécessaires à l'isolation et à
--                l'idempotence.
--   EXCLU    : les tables du modèle MVP documenté (orders, order_items, products,
--              customers, zones, vehicles, drivers, driver_positions, deliveries,
--              proofs, payments, settlements, memberships, roles, permissions,
--              role_permissions, notifications, settings) restent à migrer
--              lorsque leurs modules seront implémentés. Aucun code ne les
--              interroge aujourd'hui : les créer maintenant ajouterait des tables
--              non vérifiées.
--
-- Ce fichier est vérifié en exécution réelle : tests/reality/db.reality.test.ts
-- l'applique sur un PostgreSQL 16 et rejoue chaque contrainte.
--
-- Correspondance des types (Prisma → PostgreSQL) : DateTime → TIMESTAMP(3),
-- Json → JSONB, Float → DOUBLE PRECISION, Int → INTEGER, @default(uuid()) →
-- DEFAULT gen_random_uuid().

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE "MissionStatus" AS ENUM (
  'A_AFFECTER', 'AFFECTEE', 'EN_ROUTE', 'ARRIVE',
  'LIVREE', 'ECHEC', 'REPROGRAMMEE', 'RETOUR'
);

CREATE TYPE "TruthStatus" AS ENUM (
  'REEL', 'ESTIME', 'DERNIERE_POSITION_CONNUE',
  'INDISPONIBLE', 'A_VERIFIER', 'CONFIRME'
);

CREATE TYPE "CashMovementType" AS ENUM (
  'ENCAISSEMENT', 'REMISE', 'CORRECTION', 'ANNULATION'
);

-- ---------------------------------------------------------------------------
-- Tenants
-- ---------------------------------------------------------------------------

CREATE TABLE "companies" (
  "id"        TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "name"      TEXT         NOT NULL,
  "slug"      TEXT         NOT NULL,
  "country"   TEXT         NOT NULL DEFAULT 'SN',
  "currency"  TEXT         NOT NULL DEFAULT 'XOF',
  "timezone"  TEXT         NOT NULL DEFAULT 'Africa/Dakar',
  "phone"     TEXT,
  "address"   TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "companies_slug_key" ON "companies" ("slug");

CREATE TABLE "users" (
  "id"           TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "email"        TEXT         NOT NULL,
  "phone"        TEXT,
  "passwordHash" TEXT         NOT NULL,
  "passwordSalt" TEXT         NOT NULL,
  "tokenVersion" INTEGER      NOT NULL DEFAULT 0,
  "firstName"    TEXT         NOT NULL,
  "lastName"     TEXT         NOT NULL,
  "isActive"     BOOLEAN      NOT NULL DEFAULT true,
  "lastLoginAt"  TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users" ("email");

-- ---------------------------------------------------------------------------
-- Missions
-- ---------------------------------------------------------------------------

CREATE TABLE "missions" (
  "id"                 TEXT          NOT NULL DEFAULT gen_random_uuid()::text,
  "companyId"          TEXT          NOT NULL,
  "reference"          TEXT          NOT NULL,
  "orderId"            TEXT,
  "clientName"         TEXT          NOT NULL,
  "phone"              TEXT,
  "status"             "MissionStatus" NOT NULL DEFAULT 'A_AFFECTER',
  "country"            TEXT          DEFAULT 'SN',
  "city"               TEXT,
  "quartier"           TEXT,
  "zone"               TEXT,
  "writtenAddress"     TEXT,
  "landmark"           TEXT,
  "accessInstructions" TEXT,
  "latitude"           DOUBLE PRECISION,
  "longitude"          DOUBLE PRECISION,
  "gpsAt"              TIMESTAMP(3),
  "gpsTruth"           "TruthStatus" NOT NULL DEFAULT 'INDISPONIBLE',
  "proofId"            TEXT,
  "assignedUserId"     TEXT,
  "expectedAmount"     INTEGER       NOT NULL DEFAULT 0,
  "collectedAmount"    INTEGER       NOT NULL DEFAULT 0,
  "remittedAmount"     INTEGER       NOT NULL DEFAULT 0,
  "recordedAt"         TIMESTAMP(3),
  "syncedAt"           TIMESTAMP(3),
  "deviceId"           TEXT,
  "createdAt"          TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3)  NOT NULL,
  CONSTRAINT "missions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "missions_companyId_fkey" FOREIGN KEY ("companyId")
    REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "missions_assignedUserId_fkey" FOREIGN KEY ("assignedUserId")
    REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  -- Intégrité monétaire : des montants négatifs sont impossibles, et on ne
  -- remet jamais plus qu'on n'a encaissé. Ces garde-fous vivent dans la base
  -- pour survivre à un bug applicatif.
  CONSTRAINT "missions_expectedAmount_non_negative"  CHECK ("expectedAmount"  >= 0),
  CONSTRAINT "missions_collectedAmount_non_negative" CHECK ("collectedAmount" >= 0),
  CONSTRAINT "missions_remittedAmount_non_negative"  CHECK ("remittedAmount"  >= 0),
  CONSTRAINT "missions_remitted_le_collected"        CHECK ("remittedAmount"  <= "collectedAmount"),
  -- Coordonnées GPS bornées : rejette une position hors du globe.
  CONSTRAINT "missions_latitude_range"  CHECK ("latitude"  IS NULL OR ("latitude"  >= -90  AND "latitude"  <= 90)),
  CONSTRAINT "missions_longitude_range" CHECK ("longitude" IS NULL OR ("longitude" >= -180 AND "longitude" <= 180))
);

CREATE UNIQUE INDEX "missions_companyId_reference_key" ON "missions" ("companyId", "reference");
CREATE INDEX "missions_companyId_status_idx" ON "missions" ("companyId", "status");
CREATE INDEX "missions_companyId_assignedUserId_status_idx" ON "missions" ("companyId", "assignedUserId", "status");
CREATE INDEX "missions_companyId_createdAt_idx" ON "missions" ("companyId", "createdAt");

-- ---------------------------------------------------------------------------
-- Caisse : journal immuable des mouvements
-- ---------------------------------------------------------------------------

CREATE TABLE "cash_movements" (
  "id"             TEXT               NOT NULL DEFAULT gen_random_uuid()::text,
  "companyId"      TEXT               NOT NULL,
  "missionId"      TEXT               NOT NULL,
  "driverId"       TEXT,
  "type"           "CashMovementType" NOT NULL,
  "amount"         INTEGER            NOT NULL,
  "note"           TEXT,
  "actorUserId"    TEXT               NOT NULL,
  "idempotencyKey" TEXT               NOT NULL,
  "requestHash"    TEXT               NOT NULL,
  "recordedAt"     TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cash_movements_companyId_fkey" FOREIGN KEY ("companyId")
    REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cash_movements_missionId_fkey" FOREIGN KEY ("missionId")
    REFERENCES "missions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  -- Montant strictement positif : le sens est porté par « type ».
  CONSTRAINT "cash_movements_amount_positive" CHECK ("amount" > 0)
);

-- Une même clé d'idempotence ne peut produire qu'un seul mouvement d'espèces
-- par entreprise. C'est cette contrainte — et non un test applicatif — qui rend
-- la répétition d'un encaissement impossible sous concurrence.
CREATE UNIQUE INDEX "cash_movements_companyId_idempotencyKey_key"
  ON "cash_movements" ("companyId", "idempotencyKey");
CREATE INDEX "cash_movements_companyId_createdAt_idx" ON "cash_movements" ("companyId", "createdAt");
CREATE INDEX "cash_movements_missionId_type_idx" ON "cash_movements" ("missionId", "type");
CREATE INDEX "cash_movements_companyId_driverId_createdAt_idx"
  ON "cash_movements" ("companyId", "driverId", "createdAt");

-- ---------------------------------------------------------------------------
-- Idempotence générique
-- ---------------------------------------------------------------------------

CREATE TABLE "mutation_keys" (
  "id"             TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "companyId"      TEXT         NOT NULL,
  "operation"      TEXT         NOT NULL,
  "idempotencyKey" TEXT         NOT NULL,
  "requestHash"    TEXT         NOT NULL,
  "resultJson"     TEXT         NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mutation_keys_pkey" PRIMARY KEY ("id")
);

-- L'unicité est locale à (entreprise, opération) : deux entreprises peuvent
-- employer la même clé sans se bloquer mutuellement, et une clé rejouée sur une
-- autre mission n'est pas absorbée silencieusement.
CREATE UNIQUE INDEX "mutation_keys_companyId_operation_idempotencyKey_key"
  ON "mutation_keys" ("companyId", "operation", "idempotencyKey");
CREATE INDEX "mutation_keys_companyId_createdAt_idx" ON "mutation_keys" ("companyId", "createdAt");

-- ---------------------------------------------------------------------------
-- Journal d'audit
-- ---------------------------------------------------------------------------

CREATE TABLE "audit_logs" (
  "id"         TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "companyId"  TEXT,
  "userId"     TEXT,
  "action"     TEXT         NOT NULL,
  "entityType" TEXT         NOT NULL,
  "entityId"   TEXT         NOT NULL,
  "before"     JSONB,
  "after"      JSONB,
  "ip"         TEXT,
  "requestId"  TEXT,
  "source"     TEXT         NOT NULL DEFAULT 'API',
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audit_logs_companyId_fkey" FOREIGN KEY ("companyId")
    REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "audit_logs_companyId_createdAt_idx" ON "audit_logs" ("companyId", "createdAt");
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs" ("entityType", "entityId");
