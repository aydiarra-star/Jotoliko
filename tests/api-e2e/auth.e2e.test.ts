// Tests HTTP — authentification, jetons, sessions.
//
// Chaque cas passe par le serveur réel : aucun garde n'est simulé. Les jetons
// forgés sont fabriqués avec la vraie fonction d'encodage (`encodeToken`), ce qui
// garantit que le test porte bien sur la vérification du serveur.

import { afterAll, beforeAll, expect, it } from "vitest";
import { encodeToken, TOKEN_TTL_MS } from "../../lib/jotoliko-os/auth";
import {
  DEFAULT_PASSWORD,
  TEST_AUTH_SECRET,
  httpSuite,
  login,
  migrateFresh,
  request,
  seedActor,
  seedCompany,
  startApi,
  type Actor,
  type RunningApi,
  type SqlClient,
  connect,
  loginAttempt,
} from "./harness";

let db: SqlClient;
let api: RunningApi;
let companyId: string;
let slug: string;
let owner: Actor;
let ownerToken: string;

httpSuite("HTTP — authentification et jetons", () => {
  beforeAll(async () => {
    db = await connect();
    await migrateFresh(db);
    api = await startApi({ env: { TRUST_PROXY_HOPS: "1" } });
    slug = `auth-${Date.now().toString(36)}`;
    companyId = await seedCompany(db, slug);
    owner = await seedActor(db, { companyId, role: "OWNER" });
    ownerToken = await login(api, slug, owner);
  }, 120_000);

  afterAll(async () => {
    await api?.stop();
    await db?.close();
  });

  it("délivre un jeton exploitable et un rôle lu depuis l'appartenance", async () => {
    const response = await loginAttempt<{ accessToken: string; user: { role: string; companyId: string } }>(api, {
      companyId: slug,
      email: owner.email,
      password: owner.password,
    });

    expect(response.status).toBe(200);
    expect(response.body.user.role).toBe("OWNER");
    expect(response.body.user.companyId).toBe(companyId);
    expect(response.body.accessToken.split(".")).toHaveLength(4);

    const missions = await request(api, { path: "/missions", token: response.body.accessToken });
    expect(missions.status).toBe(200);
  });

  it("accepte l'identifiant d'entreprise comme identifiant ou comme slug", async () => {
    const byId = await loginAttempt<{ accessToken?: string }>(api, {
      companyId,
      email: owner.email,
      password: owner.password,
    });
    expect(byId.status).toBe(200);
    expect(byId.body.accessToken).toBeTruthy();
  });

  it("refuse un mot de passe invalide sans révéler la cause", async () => {
    const response = await loginAttempt<{ message: string }>(api, {
      companyId: slug,
      email: owner.email,
      password: "MauvaisMotDePasse-9999",
    });
    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Identifiants invalides");
  });

  it("refuse une entreprise inconnue avec le même message qu'un mot de passe invalide", async () => {
    const unknownCompany = await loginAttempt<{ message: string }>(api, {
      companyId: "entreprise-inexistante",
      email: owner.email,
      password: owner.password,
    });
    const unknownUser = await loginAttempt<{ message: string }>(api, {
      companyId: slug,
      email: `inconnu-${Date.now()}@jotoliko.test`,
      password: owner.password,
    });

    expect(unknownCompany.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    // Message identique dans les deux cas : pas d'énumération possible.
    expect(unknownCompany.body.message).toBe(unknownUser.body.message);
  });

  it("refuse un compte désactivé", async () => {
    const inactive = await seedActor(db, { companyId, role: "MANAGER", isActive: false });
    const response = await loginAttempt(api, {
      companyId: slug,
      email: inactive.email,
      password: DEFAULT_PASSWORD,
    });
    expect(response.status).toBe(401);
  });

  it("refuse l'accès sans en-tête Authorization", async () => {
    const response = await request(api, { path: "/missions" });
    expect(response.status).toBe(401);
  });

  it("refuse un jeton malformé", async () => {
    for (const token of ["abc", "v1.xxx.yyy", "v1.a.b.c.d", "Bearer", ""]) {
      const response = await request(api, { path: "/missions", token });
      expect(response.status, `jeton « ${token} »`).toBe(401);
    }
  });

  it("refuse un jeton signé avec un autre secret", async () => {
    const forged = encodeToken(
      "un-autre-secret-de-48-caracteres-0123456789abcdef",
      { sub: owner.userId, cid: companyId, role: "OWNER", tv: 0 },
      Date.now()
    );
    const response = await request(api, { path: "/missions", token: forged });
    expect(response.status).toBe(401);
  });

  it("refuse un jeton expiré", async () => {
    const expired = encodeToken(
      TEST_AUTH_SECRET,
      { sub: owner.userId, cid: companyId, role: "OWNER", tv: 0 },
      Date.now() - TOKEN_TTL_MS - 60_000
    );
    const response = await request(api, { path: "/missions", token: expired });
    expect(response.status).toBe(401);
  });

  it("refuse un jeton dont la charge utile a été modifiée", async () => {
    const [version, , issued, signature] = ownerToken.split(".") as [string, string, string, string];
    const tampered = Buffer.from(
      JSON.stringify({ sub: "autre-utilisateur", cid: companyId, role: "OWNER", tv: 0 }),
      "utf8"
    ).toString("base64url");
    const response = await request(api, {
      path: "/missions",
      token: `${version}.${tampered}.${issued}.${signature}`,
    });
    expect(response.status).toBe(401);
  });

  it("refuse un jeton dont le rôle diverge du rôle réel en base", async () => {
    const driver = await seedActor(db, { companyId, role: "DRIVER" });
    const elevated = encodeToken(
      TEST_AUTH_SECRET,
      { sub: driver.userId, cid: companyId, role: "OWNER", tv: 0 },
      Date.now()
    );
    const response = await request(api, { path: "/missions", token: elevated });
    expect(response.status).toBe(401);
  });

  it("invalide immédiatement les jetons quand tokenVersion change", async () => {
    const manager = await seedActor(db, { companyId, role: "MANAGER" });
    const token = await login(api, slug, manager);
    expect((await request(api, { path: "/missions", token })).status).toBe(200);

    await db.query(`UPDATE users SET "tokenVersion" = "tokenVersion" + 1 WHERE id = $1`, [manager.userId]);

    expect((await request(api, { path: "/missions", token })).status).toBe(401);
  });

  it("invalide un jeton quand le compte est désactivé après émission", async () => {
    const seller = await seedActor(db, { companyId, role: "SELLER" });
    const token = await login(api, slug, seller);
    expect((await request(api, { path: "/missions", token })).status).toBe(200);

    await db.query(`UPDATE users SET "isActive" = false WHERE id = $1`, [seller.userId]);

    expect((await request(api, { path: "/missions", token })).status).toBe(401);
  });

  it("invalide un jeton quand l'appartenance est retirée", async () => {
    const viewer = await seedActor(db, { companyId, role: "VIEWER" });
    const token = await login(api, slug, viewer);

    await db.query(`DELETE FROM memberships WHERE "userId" = $1 AND "companyId" = $2`, [viewer.userId, companyId]);

    expect((await request(api, { path: "/missions", token })).status).toBe(401);
  });

  it("rejette une charge utile de connexion invalide", async () => {
    const badEmail = await loginAttempt(api, { companyId: slug, email: "pas-un-email", password: owner.password });
    const shortPassword = await loginAttempt(api, { companyId: slug, email: owner.email, password: "court" });
    const unknownField = await loginAttempt(api, {
      companyId: slug,
      email: owner.email,
      password: owner.password,
      role: "OWNER",
    });

    expect(badEmail.status).toBe(400);
    expect(shortPassword.status).toBe(400);
    // Une propriété non déclarée est rejetée, pas ignorée : impossible d'injecter
    // un rôle par le corps de la requête.
    expect(unknownField.status).toBe(400);
  });

  it("ne divulgue jamais le secret ni le mot de passe dans une réponse d'erreur", async () => {
    const response = await loginAttempt(api, {
      companyId: slug,
      email: owner.email,
      password: "MauvaisMotDePasse-9999",
    });
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain(TEST_AUTH_SECRET);
    expect(serialized.toLowerCase()).not.toContain("scrypt");
    expect(serialized).not.toContain(owner.password);
  });
});
