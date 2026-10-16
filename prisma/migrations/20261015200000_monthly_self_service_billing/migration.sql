-- Abonnements SaaS mensuels. Migration additive : aucune table opérationnelle
-- existante n'est modifiée ou supprimée. Aucun tarif n'est créé implicitement.

CREATE TYPE "SubscriptionStatus" AS ENUM (
  'PENDING_PAYMENT',
  'ACTIVE',
  'PAST_DUE',
  'GRACE_PERIOD',
  'SUSPENDED',
  'CANCELLED',
  'EXPIRED'
);

CREATE TYPE "SignupAttemptStatus" AS ENUM (
  'PENDING_PAYMENT',
  'ACTIVE',
  'PAYMENT_FAILED',
  'EXPIRED',
  'CANCELLED'
);

CREATE TYPE "BillingPaymentStatus" AS ENUM (
  'PENDING',
  'CONFIRMED',
  'FAILED',
  'REFUNDED'
);

CREATE TABLE "plan_prices" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'XOF',
  "unitPriceXof" INTEGER NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveUntil" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "plan_prices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "plan_prices_unitPriceXof_positive" CHECK ("unitPriceXof" > 0),
  CONSTRAINT "plan_prices_version_positive" CHECK ("version" > 0),
  CONSTRAINT "plan_prices_currency_xof" CHECK ("currency" = 'XOF'),
  CONSTRAINT "plan_prices_effective_range" CHECK ("effectiveUntil" IS NULL OR "effectiveUntil" > "effectiveFrom")
);

CREATE UNIQUE INDEX "plan_prices_code_version_key" ON "plan_prices" ("code", "version");
CREATE INDEX "plan_prices_isActive_effectiveFrom_effectiveUntil_idx"
  ON "plan_prices" ("isActive", "effectiveFrom", "effectiveUntil");

CREATE TABLE "subscriptions" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "planPriceId" TEXT NOT NULL,
  "seatLimit" INTEGER NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
  "currentPeriodStart" TIMESTAMP(3),
  "currentPeriodEnd" TIMESTAMP(3),
  "gracePeriodEndsAt" TIMESTAMP(3),
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "provider" TEXT,
  "providerCustomerRef" TEXT,
  "providerSubscriptionRef" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "subscriptions_seatLimit_range" CHECK ("seatLimit" BETWEEN 1 AND 500),
  CONSTRAINT "subscriptions_period_range" CHECK (
    "currentPeriodStart" IS NULL OR "currentPeriodEnd" IS NULL OR "currentPeriodEnd" > "currentPeriodStart"
  ),
  CONSTRAINT "subscriptions_companyId_fkey" FOREIGN KEY ("companyId")
    REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "subscriptions_planPriceId_fkey" FOREIGN KEY ("planPriceId")
    REFERENCES "plan_prices" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "subscriptions_companyId_status_idx" ON "subscriptions" ("companyId", "status");
CREATE INDEX "subscriptions_currentPeriodEnd_idx" ON "subscriptions" ("currentPeriodEnd");
CREATE INDEX "subscriptions_provider_providerSubscriptionRef_idx"
  ON "subscriptions" ("provider", "providerSubscriptionRef");

CREATE TABLE "signup_attempts" (
  "id" TEXT NOT NULL,
  "companyName" TEXT NOT NULL,
  "companySlug" TEXT NOT NULL,
  "ownerEmail" TEXT NOT NULL,
  "ownerFirstName" TEXT NOT NULL,
  "ownerLastName" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "passwordSalt" TEXT NOT NULL,
  "seatCount" INTEGER NOT NULL,
  "planPriceId" TEXT NOT NULL,
  "status" "SignupAttemptStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "signup_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "signup_attempts_seatCount_range" CHECK ("seatCount" BETWEEN 1 AND 500),
  CONSTRAINT "signup_attempts_companyName_not_blank" CHECK (length(trim("companyName")) > 0),
  CONSTRAINT "signup_attempts_ownerEmail_not_blank" CHECK (length(trim("ownerEmail")) > 0),
  CONSTRAINT "signup_attempts_planPriceId_fkey" FOREIGN KEY ("planPriceId")
    REFERENCES "plan_prices" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "signup_attempts_ownerEmail_status_idx" ON "signup_attempts" ("ownerEmail", "status");
CREATE INDEX "signup_attempts_companySlug_idx" ON "signup_attempts" ("companySlug");
CREATE INDEX "signup_attempts_status_expiresAt_idx" ON "signup_attempts" ("status", "expiresAt");

CREATE TABLE "billing_payments" (
  "id" TEXT NOT NULL,
  "signupAttemptId" TEXT,
  "subscriptionId" TEXT,
  "provider" TEXT NOT NULL,
  "providerReference" TEXT,
  "amountXof" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'XOF',
  "status" "BillingPaymentStatus" NOT NULL DEFAULT 'PENDING',
  "idempotencyKey" TEXT NOT NULL,
  "rawEventHash" TEXT,
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "billing_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "billing_payments_amount_positive" CHECK ("amountXof" > 0),
  CONSTRAINT "billing_payments_currency_xof" CHECK ("currency" = 'XOF'),
  CONSTRAINT "billing_payments_owner_required" CHECK ("signupAttemptId" IS NOT NULL OR "subscriptionId" IS NOT NULL),
  CONSTRAINT "billing_payments_signupAttemptId_fkey" FOREIGN KEY ("signupAttemptId")
    REFERENCES "signup_attempts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "billing_payments_subscriptionId_fkey" FOREIGN KEY ("subscriptionId")
    REFERENCES "subscriptions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "billing_payments_idempotencyKey_key" ON "billing_payments" ("idempotencyKey");
CREATE UNIQUE INDEX "billing_payments_provider_providerReference_key"
  ON "billing_payments" ("provider", "providerReference");
CREATE INDEX "billing_payments_signupAttemptId_status_idx" ON "billing_payments" ("signupAttemptId", "status");
CREATE INDEX "billing_payments_subscriptionId_status_idx" ON "billing_payments" ("subscriptionId", "status");
