-- Migration 0002 — modèle MVP documenté : référentiels, commandes, livraison,
-- preuves, paiements, remises de caisse, notifications et réglages.
--
-- Complète la migration 0001 (socle multi-entreprise et couche opérationnelle).
-- Aucun code n'interroge encore ces tables : elles sont créées pour que le
-- schéma canonique et les migrations cessent de diverger, et pour que les
-- modules à venir n'aient pas à inventer leur modèle.
--
-- Conventions identiques à 0001 : DateTime → TIMESTAMP(3), Json → JSONB,
-- Float → DOUBLE PRECISION, Int → INTEGER, @default(uuid()) →
-- DEFAULT gen_random_uuid()::text, @default(now()) → DEFAULT CURRENT_TIMESTAMP.
-- Les colonnes @updatedAt n'ont pas de valeur par défaut en base : Prisma les
-- renseigne à l'écriture.
--
-- Actions référentielles : celles déclarées dans le schéma, et à défaut le
-- défaut Prisma pour PostgreSQL — RESTRICT sur une relation obligatoire,
-- SET NULL sur une relation facultative, toujours avec ON UPDATE CASCADE.

-- ---------------------------------------------------------------------------
-- Enums du modèle MVP
-- ---------------------------------------------------------------------------

CREATE TYPE "OrderStatus" AS ENUM (
  'DRAFT', 'CONFIRMED', 'ASSIGNED', 'PICKED_UP',
  'IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELLED'
);

CREATE TYPE "PaymentMethod" AS ENUM (
  'CASH_ON_DELIVERY', 'CASH_UPFRONT', 'WAVE', 'ORANGE_MONEY',
  'FREE_MONEY', 'BANK_TRANSFER', 'CREDIT'
);

CREATE TYPE "DeliveryStatus" AS ENUM (
  'PENDING', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT',
  'DELIVERED', 'FAILED', 'CANCELLED'
);

CREATE TYPE "ProofType" AS ENUM ('PHOTO', 'SIGNATURE', 'RECIPIENT_NAME', 'NOTE');

CREATE TYPE "PaymentStatus" AS ENUM (
  'PENDING', 'COLLECTED', 'SETTLED', 'DISPUTED', 'CANCELLED'
);

CREATE TYPE "SettlementStatus" AS ENUM (
  'OPEN', 'SUBMITTED', 'VALIDATED', 'DISPUTED', 'CLOSED'
);

CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'WHATSAPP', 'SMS', 'EMAIL');

-- ---------------------------------------------------------------------------
-- Rôles et appartenances
-- ---------------------------------------------------------------------------

CREATE TABLE "roles" (
  "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "code"        TEXT NOT NULL,
  "label"       TEXT NOT NULL,
  "description" TEXT,
  CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "roles_code_key" ON "roles" ("code");

CREATE TABLE "permissions" (
  "id"    TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "code"  TEXT NOT NULL,
  "label" TEXT NOT NULL,
  CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "permissions_code_key" ON "permissions" ("code");

CREATE TABLE "memberships" (
  "id"        TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "userId"    TEXT         NOT NULL,
  "companyId" TEXT         NOT NULL,
  "roleId"    TEXT         NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "memberships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "memberships_companyId_fkey" FOREIGN KEY ("companyId")
    REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "memberships_roleId_fkey" FOREIGN KEY ("roleId")
    REFERENCES "roles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "memberships_userId_companyId_key" ON "memberships" ("userId", "companyId");
CREATE INDEX "memberships_companyId_idx" ON "memberships" ("companyId");

CREATE TABLE "role_permissions" (
  "roleId"       TEXT NOT NULL,
  "permissionId" TEXT NOT NULL,
  CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId", "permissionId"),
  CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId")
    REFERENCES "roles" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId")
    REFERENCES "permissions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- ---------------------------------------------------------------------------
-- Référentiels terrain
-- ---------------------------------------------------------------------------

CREATE TABLE "zones" (
  "id"        TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "companyId" TEXT         NOT NULL,
  "name"      TEXT         NOT NULL,
  "city"      TEXT,
  "centerLat" DOUBLE PRECISION,
  "centerLng" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "zones_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "zones_companyId_fkey" FOREIGN KEY ("companyId")
    REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "zones_companyId_name_key" ON "zones" ("companyId", "name");
CREATE INDEX "zones_companyId_idx" ON "zones" ("companyId");

CREATE TABLE "vehicles" (
  "id"        TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "companyId" TEXT         NOT NULL,
  "plate"     TEXT,
  "label"     TEXT         NOT NULL,
  "type"      TEXT         NOT NULL DEFAULT 'MOTORCYCLE',
  "isActive"  BOOLEAN      NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vehicles_companyId_fkey" FOREIGN KEY ("companyId")
    REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "vehicles_companyId_idx" ON "vehicles" ("companyId");

CREATE TABLE "drivers" (
  "id"        TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "companyId" TEXT         NOT NULL,
  "userId"    TEXT,
  "vehicleId" TEXT,
  "code"      TEXT         NOT NULL,
  "firstName" TEXT         NOT NULL,
  "lastName"  TEXT         NOT NULL,
  "phone"     TEXT         NOT NULL,
  "isActive"  BOOLEAN      NOT NULL DEFAULT true,
  "hiredAt"   TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "drivers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "drivers_companyId_fkey" FOREIGN KEY ("companyId")
    REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "drivers_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "drivers_vehicleId_fkey" FOREIGN KEY ("vehicleId")
    REFERENCES "vehicles" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "drivers_userId_key" ON "drivers" ("userId");
CREATE UNIQUE INDEX "drivers_companyId_code_key" ON "drivers" ("companyId", "code");
CREATE INDEX "drivers_companyId_isActive_idx" ON "drivers" ("companyId", "isActive");

CREATE TABLE "driver_positions" (
  "id"         TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "driverId"   TEXT         NOT NULL,
  "lat"        DOUBLE PRECISION NOT NULL,
  "lng"        DOUBLE PRECISION NOT NULL,
  "accuracy"   DOUBLE PRECISION,
  "battery"    INTEGER,
  "recordedAt" TIMESTAMP(3) NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "driver_positions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "driver_positions_driverId_fkey" FOREIGN KEY ("driverId")
    REFERENCES "drivers" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "driver_positions_driverId_recordedAt_idx"
  ON "driver_positions" ("driverId", "recordedAt");

CREATE TABLE "customers" (
  "id"          TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "companyId"   TEXT         NOT NULL,
  "name"        TEXT         NOT NULL,
  "phone"       TEXT         NOT NULL,
  "email"       TEXT,
  "addressLine" TEXT,
  "landmark"    TEXT,
  "zoneId"      TEXT,
  "lat"         DOUBLE PRECISION,
  "lng"         DOUBLE PRECISION,
  "notes"       TEXT,
  "isActive"    BOOLEAN      NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customers_companyId_fkey" FOREIGN KEY ("companyId")
    REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "customers_zoneId_fkey" FOREIGN KEY ("zoneId")
    REFERENCES "zones" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "customers_companyId_phone_idx" ON "customers" ("companyId", "phone");

CREATE TABLE "products" (
  "id"        TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "companyId" TEXT         NOT NULL,
  "sku"       TEXT,
  "name"      TEXT         NOT NULL,
  "unitPrice" INTEGER      NOT NULL DEFAULT 0,
  "isActive"  BOOLEAN      NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "products_companyId_idx" ON "products" ("companyId");

-- ---------------------------------------------------------------------------
-- Commandes
-- ---------------------------------------------------------------------------

CREATE TABLE "orders" (
  "id"            TEXT          NOT NULL DEFAULT gen_random_uuid()::text,
  "companyId"     TEXT          NOT NULL,
  "customerId"    TEXT          NOT NULL,
  "zoneId"        TEXT,
  "reference"     TEXT          NOT NULL,
  "status"        "OrderStatus" NOT NULL DEFAULT 'DRAFT',
  "subtotal"      INTEGER       NOT NULL DEFAULT 0,
  "deliveryFee"   INTEGER       NOT NULL DEFAULT 0,
  "discount"      INTEGER       NOT NULL DEFAULT 0,
  "total"         INTEGER       NOT NULL DEFAULT 0,
  "amountDue"     INTEGER       NOT NULL DEFAULT 0,
  "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH_ON_DELIVERY',
  "isPaid"        BOOLEAN       NOT NULL DEFAULT false,
  "paidAt"        TIMESTAMP(3),
  "scheduledFor"  TIMESTAMP(3),
  "notes"         TEXT,
  "cancelReason"  TEXT,
  "createdAt"     TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3)  NOT NULL,
  CONSTRAINT "orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "orders_companyId_fkey" FOREIGN KEY ("companyId")
    REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "orders_customerId_fkey" FOREIGN KEY ("customerId")
    REFERENCES "customers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "orders_zoneId_fkey" FOREIGN KEY ("zoneId")
    REFERENCES "zones" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "orders_companyId_reference_key" ON "orders" ("companyId", "reference");
CREATE INDEX "orders_companyId_status_idx" ON "orders" ("companyId", "status");
CREATE INDEX "orders_companyId_createdAt_idx" ON "orders" ("companyId", "createdAt");

CREATE TABLE "order_items" (
  "id"        TEXT    NOT NULL DEFAULT gen_random_uuid()::text,
  "orderId"   TEXT    NOT NULL,
  "productId" TEXT,
  "label"     TEXT    NOT NULL,
  "quantity"  INTEGER NOT NULL DEFAULT 1,
  "unitPrice" INTEGER NOT NULL DEFAULT 0,
  "lineTotal" INTEGER NOT NULL DEFAULT 0,
  "notes"     TEXT,
  CONSTRAINT "order_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId")
    REFERENCES "orders" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "order_items_productId_fkey" FOREIGN KEY ("productId")
    REFERENCES "products" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "order_items_orderId_idx" ON "order_items" ("orderId");

CREATE TABLE "order_status_history" (
  "id"              TEXT          NOT NULL DEFAULT gen_random_uuid()::text,
  "orderId"         TEXT          NOT NULL,
  "fromStatus"      "OrderStatus",
  "toStatus"        "OrderStatus" NOT NULL,
  "changedByUserId" TEXT,
  "reason"          TEXT,
  "createdAt"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_status_history_orderId_fkey" FOREIGN KEY ("orderId")
    REFERENCES "orders" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "order_status_history_orderId_createdAt_idx"
  ON "order_status_history" ("orderId", "createdAt");

-- ---------------------------------------------------------------------------
-- Livraison et preuves
-- ---------------------------------------------------------------------------

CREATE TABLE "deliveries" (
  "id"            TEXT             NOT NULL DEFAULT gen_random_uuid()::text,
  "companyId"     TEXT             NOT NULL,
  "orderId"       TEXT             NOT NULL,
  "driverId"      TEXT,
  "clientId"      TEXT,
  "status"        "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "sequence"      INTEGER,
  "assignedAt"    TIMESTAMP(3),
  "pickedUpAt"    TIMESTAMP(3),
  "deliveredAt"   TIMESTAMP(3),
  "failedAt"      TIMESTAMP(3),
  "failureReason" TEXT,
  "recordedAt"    TIMESTAMP(3),
  "syncedAt"      TIMESTAMP(3),
  "deviceId"      TEXT,
  "createdAt"     TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3)     NOT NULL,
  CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "deliveries_companyId_fkey" FOREIGN KEY ("companyId")
    REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "deliveries_orderId_fkey" FOREIGN KEY ("orderId")
    REFERENCES "orders" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "deliveries_driverId_fkey" FOREIGN KEY ("driverId")
    REFERENCES "drivers" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "deliveries_orderId_key" ON "deliveries" ("orderId");
CREATE UNIQUE INDEX "deliveries_clientId_key" ON "deliveries" ("clientId");
CREATE INDEX "deliveries_companyId_status_idx" ON "deliveries" ("companyId", "status");
CREATE INDEX "deliveries_driverId_status_idx" ON "deliveries" ("driverId", "status");

CREATE TABLE "proofs" (
  "id"            TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "deliveryId"    TEXT         NOT NULL,
  "type"          "ProofType"  NOT NULL DEFAULT 'PHOTO',
  "fileUrl"       TEXT,
  "recipientName" TEXT,
  "signatureUrl"  TEXT,
  "note"          TEXT,
  "lat"           DOUBLE PRECISION,
  "lng"           DOUBLE PRECISION,
  "clientId"      TEXT,
  "recordedAt"    TIMESTAMP(3) NOT NULL,
  "syncedAt"      TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "proofs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "proofs_deliveryId_fkey" FOREIGN KEY ("deliveryId")
    REFERENCES "deliveries" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "proofs_clientId_key" ON "proofs" ("clientId");
CREATE INDEX "proofs_deliveryId_idx" ON "proofs" ("deliveryId");

-- ---------------------------------------------------------------------------
-- Encaissements et remises de caisse
-- ---------------------------------------------------------------------------

CREATE TABLE "settlements" (
  "id"                TEXT               NOT NULL DEFAULT gen_random_uuid()::text,
  "companyId"         TEXT               NOT NULL,
  "driverId"          TEXT               NOT NULL,
  "reference"         TEXT               NOT NULL,
  "periodStart"       TIMESTAMP(3)       NOT NULL,
  "periodEnd"         TIMESTAMP(3)       NOT NULL,
  "expectedAmount"    INTEGER            NOT NULL,
  "declaredAmount"    INTEGER            NOT NULL,
  "receivedAmount"    INTEGER,
  "variance"          INTEGER            NOT NULL DEFAULT 0,
  "status"            "SettlementStatus" NOT NULL DEFAULT 'OPEN',
  "note"              TEXT,
  "validatedByUserId" TEXT,
  "closedAt"          TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3)       NOT NULL,
  CONSTRAINT "settlements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "settlements_companyId_fkey" FOREIGN KEY ("companyId")
    REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "settlements_driverId_fkey" FOREIGN KEY ("driverId")
    REFERENCES "drivers" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "settlements_companyId_reference_key" ON "settlements" ("companyId", "reference");
CREATE INDEX "settlements_companyId_status_idx" ON "settlements" ("companyId", "status");
CREATE INDEX "settlements_driverId_status_idx" ON "settlements" ("driverId", "status");

CREATE TABLE "payments" (
  "id"           TEXT            NOT NULL DEFAULT gen_random_uuid()::text,
  "companyId"    TEXT            NOT NULL,
  "orderId"      TEXT            NOT NULL,
  "deliveryId"   TEXT,
  "driverId"     TEXT,
  "amount"       INTEGER         NOT NULL,
  "method"       "PaymentMethod" NOT NULL DEFAULT 'CASH_ON_DELIVERY',
  "status"       "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "externalRef"  TEXT,
  "clientId"     TEXT,
  "collectedAt"  TIMESTAMP(3),
  "recordedAt"   TIMESTAMP(3),
  "syncedAt"     TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3)    NOT NULL,
  "settlementId" TEXT,
  CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payments_companyId_fkey" FOREIGN KEY ("companyId")
    REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payments_orderId_fkey" FOREIGN KEY ("orderId")
    REFERENCES "orders" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payments_deliveryId_fkey" FOREIGN KEY ("deliveryId")
    REFERENCES "deliveries" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "payments_settlementId_fkey" FOREIGN KEY ("settlementId")
    REFERENCES "settlements" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "payments_deliveryId_key" ON "payments" ("deliveryId");
CREATE UNIQUE INDEX "payments_clientId_key" ON "payments" ("clientId");
CREATE INDEX "payments_companyId_status_idx" ON "payments" ("companyId", "status");
CREATE INDEX "payments_driverId_idx" ON "payments" ("driverId");

-- ---------------------------------------------------------------------------
-- Transverse : notifications et réglages
-- ---------------------------------------------------------------------------

CREATE TABLE "notifications" (
  "id"        TEXT                  NOT NULL DEFAULT gen_random_uuid()::text,
  "companyId" TEXT                  NOT NULL,
  "userId"    TEXT,
  "channel"   "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
  "title"     TEXT                  NOT NULL,
  "body"      TEXT                  NOT NULL,
  "payload"   JSONB,
  "readAt"    TIMESTAMP(3),
  "sentAt"    TIMESTAMP(3),
  "createdAt" TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notifications_companyId_fkey" FOREIGN KEY ("companyId")
    REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "notifications_companyId_userId_readAt_idx"
  ON "notifications" ("companyId", "userId", "readAt");

CREATE TABLE "settings" (
  "id"                    TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "companyId"             TEXT         NOT NULL,
  "cashVarianceTolerance" INTEGER      NOT NULL DEFAULT 500,
  "proofRequired"         BOOLEAN      NOT NULL DEFAULT true,
  "defaultDeliveryFee"    INTEGER      NOT NULL DEFAULT 0,
  "data"                  JSONB,
  "updatedAt"             TIMESTAMP(3) NOT NULL,
  CONSTRAINT "settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "settings_companyId_fkey" FOREIGN KEY ("companyId")
    REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "settings_companyId_key" ON "settings" ("companyId");
