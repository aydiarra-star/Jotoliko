-- Hosted checkout URL is persisted so a resumed signup can reuse its pending invoice.
-- Additive migration: existing payment records remain unchanged.
ALTER TABLE "billing_payments" ADD COLUMN "checkoutUrl" TEXT;
