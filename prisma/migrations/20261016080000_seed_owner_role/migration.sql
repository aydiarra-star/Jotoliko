-- The self-service payment activation creates an OWNER membership.
-- Seed only the required role when absent; preserve any existing role record.
INSERT INTO "roles" ("id", "code", "label", "description")
SELECT 'role-owner-system', 'OWNER', 'Propriétaire', 'Responsable principal de l’entreprise'
WHERE NOT EXISTS (SELECT 1 FROM "roles" WHERE "code" = 'OWNER')
ON CONFLICT DO NOTHING;
