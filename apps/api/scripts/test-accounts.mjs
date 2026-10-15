#!/usr/bin/env node
/**
 * Crée des comptes FICTIFS pour un staging isolé uniquement.
 *
 * Garde-fous intentionnels :
 * - NODE_ENV=production est toujours refusé ;
 * - JOTOLIKO_ACCOUNT_ENV doit être "isolated-staging" ;
 * - le nom de la base dans DATABASE_URL doit contenir staging, test, sandbox ou ci ;
 * - aucune suppression, remise à zéro ou modification de mot de passe existant ;
 * - le compte OWNER de démonstration est activé pour permettre l'administration ;
 *   MANAGER et DRIVER restent inactifs jusqu'à une activation explicite.
 *
 * Usage:
 *   JOTOLIKO_ACCOUNT_ENV=isolated-staging DATABASE_URL=... AUTH_SECRET=... \
 *     node apps/api/scripts/test-accounts.mjs create
 *   JOTOLIKO_ACCOUNT_ENV=isolated-staging JOTOLIKO_ACCOUNT_ADMIN_APPROVED=true \
 *     DATABASE_URL=... node apps/api/scripts/test-accounts.mjs activate manager@jotoliko.test
 *
 * Les mots de passe générés sont affichés une seule fois. Ne pas les publier dans
 * un ticket, un dépôt, un journal CI ou une capture d'écran.
 */
import { randomBytes, scryptSync } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const mode = process.argv[2];
const targetEmail = process.argv[3]?.trim().toLowerCase();
const databaseUrl = process.env.DATABASE_URL;
const isProduction = process.env.NODE_ENV === "production";

function assertIsolatedStaging({ requireAdminApproval = false } = {}) {
  if (isProduction) throw new Error("Refus : NODE_ENV=production.");
  if (process.env.JOTOLIKO_ACCOUNT_ENV !== "isolated-staging") {
    throw new Error('Refus : définir JOTOLIKO_ACCOUNT_ENV="isolated-staging".');
  }
  if (!databaseUrl) throw new Error("Refus : DATABASE_URL manquant.");
  let databaseName = "";
  try {
    databaseName = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ""));
  } catch {
    throw new Error("Refus : DATABASE_URL invalide.");
  }
  if (!/(staging|test|sandbox|ci)/i.test(databaseName)) {
    throw new Error(
      "Refus : le nom de la base doit contenir staging, test, sandbox ou ci. " +
      "Utiliser une base distincte ; ne pas contourner cette vérification."
    );
  }
  if (requireAdminApproval && process.env.JOTOLIKO_ACCOUNT_ADMIN_APPROVED !== "true") {
    throw new Error("Refus : activation exige JOTOLIKO_ACCOUNT_ADMIN_APPROVED=true.");
  }
}

function newPassword() {
  // Mot de passe aléatoire généré localement, jamais codé en dur.
  return randomBytes(24).toString("base64url");
}

function hashPassword(password, salt) {
  return scryptSync(password, salt, 64).toString("hex");
}

function newCredentials(email) {
  const password = newPassword();
  const salt = randomBytes(16).toString("hex");
  return { email, password, passwordSalt: salt, passwordHash: hashPassword(password, salt) };
}

async function main() {
  if (mode !== "create" && mode !== "activate") {
    throw new Error("Usage : test-accounts.mjs create | activate <email>");
  }
  assertIsolatedStaging({ requireAdminApproval: mode === "activate" });
  if (mode === "activate" && !targetEmail) {
    throw new Error("Indiquer l'e-mail fictif exact à activer.");
  }

  const prisma = new PrismaClient();
  try {
    if (mode === "activate") {
      const allowed = new Set([
        "manager@jotoliko.test",
        "driver@jotoliko.test",
      ]);
      if (!allowed.has(targetEmail)) {
        throw new Error("Seuls les comptes fictifs MANAGER et DRIVER peuvent être activés par ce script.");
      }
      const user = await prisma.user.findUnique({ where: { email: targetEmail } });
      if (!user) throw new Error("Compte fictif introuvable ; aucune modification effectuée.");
      if (user.isActive) {
        console.log(`Aucune modification : ${targetEmail} est déjà actif.`);
        return;
      }
      await prisma.user.update({
        where: { id: user.id },
        data: { isActive: true, tokenVersion: { increment: 1 } },
      });
      console.log(`Compte fictif activé : ${targetEmail}. Aucun mot de passe n'a été modifié.`);
      return;
    }

    const companySlug = "jotoliko-staging-test";
    const company = await prisma.company.upsert({
      where: { slug: companySlug },
      update: {},
      create: {
        name: "Jotoliko — entreprise fictive de staging",
        slug: companySlug,
        country: "SN",
        currency: "XOF",
        timezone: "Africa/Dakar",
      },
    });

    const roleDefinitions = [
      { code: "OWNER", label: "Administrateur de test", description: "Compte de test isolé uniquement." },
      { code: "MANAGER", label: "Gestionnaire de test", description: "Compte fictif en attente d'activation." },
      { code: "DRIVER", label: "Livreur de test", description: "Compte fictif en attente d'activation." },
    ];
    const roles = new Map();
    for (const definition of roleDefinitions) {
      const role = await prisma.role.upsert({
        where: { code: definition.code },
        update: {},
        create: definition,
      });
      roles.set(definition.code, role);
    }

    const fixtures = [
      { email: "admin@jotoliko.test", firstName: "Admin", lastName: "Staging", role: "OWNER", active: true },
      { email: "manager@jotoliko.test", firstName: "Gestionnaire", lastName: "Test", role: "MANAGER", active: false },
      { email: "driver@jotoliko.test", firstName: "Livreur", lastName: "Test", role: "DRIVER", active: false },
    ];

    const createdCredentials = [];
    for (const fixture of fixtures) {
      const existing = await prisma.user.findUnique({ where: { email: fixture.email } });
      if (existing) {
        console.log(`Conservé sans changement : ${fixture.email} (compte déjà existant).`);
        continue;
      }

      const credentials = newCredentials(fixture.email);
      await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: fixture.email,
            firstName: fixture.firstName,
            lastName: fixture.lastName,
            passwordHash: credentials.passwordHash,
            passwordSalt: credentials.passwordSalt,
            isActive: fixture.active,
          },
        });
        await tx.membership.create({
          data: {
            userId: user.id,
            companyId: company.id,
            roleId: roles.get(fixture.role).id,
          },
        });
      });
      createdCredentials.push({ email: fixture.email, password: credentials.password, role: fixture.role, active: fixture.active });
    }

    console.log(`Entreprise de test : ${company.slug}`);
    console.log("Identifiant d'entreprise à saisir dans l'écran de connexion : " + company.slug);
    if (createdCredentials.length === 0) {
      console.log("Aucun nouveau compte créé ; aucun mot de passe n'a été régénéré.");
    } else {
      console.log("\nIDENTIFIANTS GÉNÉRÉS — à conserver localement et en sécurité :");
      for (const item of createdCredentials) {
        console.log(`\nRôle : ${item.role} | Actif : ${item.active ? "oui" : "non"}`);
        console.log(`E-mail : ${item.email}\nMot de passe : ${item.password}`);
      }
    }
    console.log("\nLe gestionnaire et le livreur sont inactifs. Leur activation est une action distincte.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`Échec sans réinitialisation de données : ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
