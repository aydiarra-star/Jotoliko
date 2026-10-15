// Tests HTTP — preuves de livraison : dépôt, stockage réel, lecture, périmètre,
// doublons, fichier manquant, suppression.
//
// Le point central : une preuve n'est pas un identifiant. Chaque cas de dépôt
// vérifie donc **le fichier sur le disque** (empreinte SHA-256 recalculée) en
// plus de la ligne en base. Un test qui se contenterait de la réponse HTTP
// validerait un formulaire, pas un stockage.

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  auditActionsFor,
  connect,
  httpSuite,
  jpegBytes,
  login,
  migrateFresh,
  pngBytes,
  proofPathOnDisk,
  request,
  seedActor,
  seedCompany,
  seedMission,
  sha256OfFile,
  startApi,
  uploadProof,
  type Actor,
  type RunningApi,
  type SqlClient,
} from "./harness";

let db: SqlClient;
let api: RunningApi;
let slug: string;
let companyId: string;
let manager: Actor;
let driver: Actor;
let driverTwo: Actor;
let viewer: Actor;
let managerToken: string;
let driverToken: string;
let driverTwoToken: string;
let viewerToken: string;

async function missionAssignedTo(userId: string, reference: string): Promise<string> {
  return seedMission(db, { companyId, reference, status: "ARRIVE", assignedUserId: userId, expectedAmount: 5000 });
}

httpSuite("HTTP — preuves de livraison", () => {
  beforeAll(async () => {
    db = await connect();
    await migrateFresh(db);
    api = await startApi({ env: { TRUST_PROXY_HOPS: "1" } });
    slug = `preuves-${Date.now().toString(36)}`;
    companyId = await seedCompany(db, slug);
    manager = await seedActor(db, { companyId, role: "MANAGER" });
    driver = await seedActor(db, { companyId, role: "DRIVER" });
    driverTwo = await seedActor(db, { companyId, role: "DRIVER" });
    viewer = await seedActor(db, { companyId, role: "VIEWER" });
    managerToken = await login(api, slug, manager);
    driverToken = await login(api, slug, driver);
    driverTwoToken = await login(api, slug, driverTwo);
    viewerToken = await login(api, slug, viewer);
  }, 120_000);

  afterAll(async () => {
    await api?.stop();
    await db?.close();
  });

  it("stocke réellement le fichier déposé et le référence à la mission", async () => {
    const missionId = await missionAssignedTo(driver.userId, "PREUVE-DEPOT");
    const content = pngBytes();

    const response = await request<any>(api, {
      path: `/missions/${missionId}/proofs`,
      token: managerToken,
      body: {
        mimeType: "image/png",
        dataBase64: content.toString("base64"),
        type: "PHOTO",
        recipientName: "Awa Ndiaye",
        note: "Colis remis en main propre",
        latitude: 14.6928,
        longitude: -17.4467,
        clientId: "terrain-preuve-0001",
      },
    });

    expect(response.status).toBe(201);
    expect(response.body.sha256).toHaveLength(64);
    expect(response.body.sizeBytes).toBe(content.length);
    expect(response.body.mimeType).toBe("image/png");
    expect(response.body.downloadedBy).toBe(`/missions/${missionId}/proofs/${response.body.id}`);

    // Le contenu est bien sur le disque, et son empreinte correspond.
    const path = proofPathOnDisk(api, companyId, missionId, response.body.sha256, "png");
    expect(existsSync(path)).toBe(true);
    expect(sha256OfFile(path)).toBe(response.body.sha256);
    expect(readFileSync(path).equals(content)).toBe(true);

    // Et la ligne en base décrit ce fichier.
    const rows = await db.query<{ storageKey: string; sizeBytes: number; recipientName: string }>(
      `SELECT "storageKey", "sizeBytes", "recipientName" FROM proof_files WHERE id = $1`,
      [response.body.id]
    );
    expect(rows.rows[0]?.sizeBytes).toBe(content.length);
    expect(rows.rows[0]?.storageKey).toContain(response.body.sha256);

    expect(await auditActionsFor(db, response.body.id)).toContain("PROOF_UPLOADED");
  });

  it("ne divulgue jamais le contenu dans les réponses de métadonnées", async () => {
    const missionId = await missionAssignedTo(driver.userId, "PREUVE-METADONNEES");
    const uploaded = await uploadProof(api, managerToken, missionId);
    const content = pngBytes();

    const list = await request<any[]>(api, { path: `/missions/${missionId}/proofs`, token: managerToken });
    const serialized = JSON.stringify(list.body);

    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(serialized).not.toContain(content.toString("base64"));
    expect(serialized).not.toContain("storageKey");
    expect(list.body[0]).not.toHaveProperty("dataBase64");
  });

  it("sert le contenu exact, uniquement en pièce jointe non mise en cache", async () => {
    const missionId = await missionAssignedTo(driver.userId, "PREUVE-LECTURE");
    const content = pngBytes();
    const uploaded = await uploadProof(api, managerToken, missionId, { content });

    const response = await fetch(
      `${api.baseUrl}/missions/${missionId}/proofs/${uploaded.body.id}`,
      { headers: { Authorization: `Bearer ${managerToken}` } }
    );
    const received = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-length")).toBe(String(content.length));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(received.equals(content)).toBe(true);
  });

  it("refuse un contenu qui ne correspond pas au type déclaré", async () => {
    const missionId = await missionAssignedTo(driver.userId, "PREUVE-FAUX-TYPE");

    // PNG annoncé comme JPEG : refusé, car renommer un fichier ne le convertit pas.
    const mismatch = await uploadProof(api, managerToken, missionId, {
      content: pngBytes(),
      mimeType: "image/jpeg",
    });
    expect(mismatch.status).toBe(415);

    // Type non accepté : rejeté par la validation.
    const unsupported = await uploadProof(api, managerToken, missionId, {
      content: pngBytes(),
      mimeType: "image/svg+xml",
    });
    expect(unsupported.status).toBe(400);

    // Contenu sans signature connue.
    const garbage = await uploadProof(api, managerToken, missionId, {
      content: Buffer.from("ceci n'est pas une image"),
      mimeType: "image/png",
    });
    expect(garbage.status).toBe(415);

    const stored = await db.query(`SELECT count(*)::int AS value FROM proof_files WHERE "missionId" = $1`, [missionId]);
    expect(stored.rows[0]?.value).toBe(0);
  });

  it("refuse un dépôt vide ou mal encodé", async () => {
    const missionId = await missionAssignedTo(driver.userId, "PREUVE-VIDE");

    const empty = await uploadProof(api, managerToken, missionId, { content: Buffer.alloc(0) });
    const malformed = await request(api, {
      path: `/missions/${missionId}/proofs`,
      token: managerToken,
      body: { mimeType: "image/png", dataBase64: "pas du base64 !!" },
    });

    expect(empty.status).toBe(400);
    expect(malformed.status).toBe(400);
  });

  it("refuse une preuve au-delà de la taille maximale", async () => {
    const missionId = await missionAssignedTo(driver.userId, "PREUVE-TROP-LOURDE");

    const oversized = jpegBytes(5 * 1024 * 1024 + 1);
    const response = await uploadProof(api, managerToken, missionId, {
      content: oversized,
      mimeType: "image/jpeg",
    });

    expect(response.status).toBe(413);
    const stored = await db.query(`SELECT count(*)::int AS value FROM proof_files WHERE "missionId" = $1`, [missionId]);
    expect(stored.rows[0]?.value).toBe(0);
  });

  it("ne crée pas de doublon lorsque le terrain rejoue son dépôt", async () => {
    const missionId = await missionAssignedTo(driver.userId, "PREUVE-REJEU");
    const content = pngBytes();
    const clientId = `terrain-${randomUUID().slice(0, 8)}`;
    const extra = { clientId };

    const first = await uploadProof(api, managerToken, missionId, { content, extra });
    const replay = await uploadProof(api, managerToken, missionId, { content, extra });

    expect(first.status).toBe(201);
    // Un rejeu n'est pas une création : 200, même identifiant.
    expect(replay.status).toBe(200);
    expect(replay.body.id).toBe(first.body.id);

    const stored = await db.query(`SELECT count(*)::int AS value FROM proof_files WHERE "missionId" = $1`, [missionId]);
    expect(stored.rows[0]?.value).toBe(1);
  });

  it("ne stocke pas deux fois le même contenu pour une mission", async () => {
    const missionId = await missionAssignedTo(driver.userId, "PREUVE-CONTENU-IDENTIQUE");
    const content = pngBytes();

    const first = await uploadProof(api, managerToken, missionId, { content });
    const again = await uploadProof(api, managerToken, missionId, { content });

    expect(again.body.id).toBe(first.body.id);
    const stored = await db.query(`SELECT count(*)::int AS value FROM proof_files WHERE "missionId" = $1`, [missionId]);
    expect(stored.rows[0]?.value).toBe(1);
  });

  it("autorise un livreur à déposer une preuve sur sa mission, en tant que pièce jointe JPEG", async () => {
    const missionId = await missionAssignedTo(driver.userId, "PREUVE-LIVREUR");
    const response = await uploadProof(api, driverToken, missionId, {
      content: jpegBytes(),
      mimeType: "image/jpeg",
    });

    expect(response.status).toBe(201);
    expect(existsSync(proofPathOnDisk(api, companyId, missionId, response.body.sha256, "jpg"))).toBe(true);
  });

  it("interdit à un livreur de déposer ou lire la preuve d'un autre livreur", async () => {
    const missionId = await missionAssignedTo(driverTwo.userId, "PREUVE-AUTRE-LIVREUR");
    const uploadedByManager = await uploadProof(api, managerToken, missionId);

    const upload = await uploadProof(api, driverToken, missionId, { content: jpegBytes() });
    const list = await request(api, { path: `/missions/${missionId}/proofs`, token: driverToken });
    const download = await request(api, {
      path: `/missions/${missionId}/proofs/${uploadedByManager.body.id}`,
      token: driverToken,
    });

    expect(upload.status).toBe(403);
    expect(list.status).toBe(403);
    expect(download.status).toBe(403);
  });

  it("autorise un lecteur à consulter les preuves mais pas à en déposer", async () => {
    const missionId = await missionAssignedTo(driver.userId, "PREUVE-LECTEUR");
    const uploaded = await uploadProof(api, managerToken, missionId);

    const list = await request<any[]>(api, { path: `/missions/${missionId}/proofs`, token: viewerToken });
    const download = await request(api, {
      path: `/missions/${missionId}/proofs/${uploaded.body.id}`,
      token: viewerToken,
    });
    const upload = await uploadProof(api, viewerToken, missionId, { content: jpegBytes() });
    const remove = await request(api, {
      method: "DELETE",
      path: `/missions/${missionId}/proofs/${uploaded.body.id}`,
      token: viewerToken,
    });

    expect(list.status).toBe(200);
    expect(download.status).toBe(200);
    expect(upload.status).toBe(403);
    expect(remove.status).toBe(403);
  });

  it("ne laisse pas une autre entreprise déposer ou lire une preuve", async () => {
    const foreignSlug = `${slug}-voisine`;
    const foreignCompanyId = await seedCompany(db, foreignSlug);
    const foreignManager = await seedActor(db, { companyId: foreignCompanyId, role: "MANAGER" });
    const foreignToken = await login(api, foreignSlug, foreignManager);

    const missionId = await missionAssignedTo(driver.userId, "PREUVE-VOISINE");
    const uploaded = await uploadProof(api, managerToken, missionId);

    const upload = await uploadProof(api, foreignToken, missionId, { content: jpegBytes() });
    const list = await request(api, { path: `/missions/${missionId}/proofs`, token: foreignToken });
    const download = await request(api, {
      path: `/missions/${missionId}/proofs/${uploaded.body.id}`,
      token: foreignToken,
    });

    // 404 : l'existence de la mission n'est pas révélée.
    expect(upload.status).toBe(404);
    expect(list.status).toBe(404);
    expect(download.status).toBe(404);

    const stored = await db.query(`SELECT count(*)::int AS value FROM proof_files WHERE "missionId" = $1`, [missionId]);
    expect(stored.rows[0]?.value).toBe(1);
  });

  it("signale explicitement un fichier absent du stockage", async () => {
    const missionId = await missionAssignedTo(driver.userId, "PREUVE-FICHIER-ABSENT");
    const uploaded = await uploadProof(api, managerToken, missionId);
    const path = proofPathOnDisk(api, companyId, missionId, uploaded.body.sha256, "png");

    // Panne d'exploitation simulée : le fichier disparaît du volume.
    rmSync(path);

    const download = await request(api, {
      path: `/missions/${missionId}/proofs/${uploaded.body.id}`,
      token: managerToken,
    });

    expect(download.status).toBe(410);
    // La référence reste visible : l'incident est traçable, pas silencieux.
    const list = await request<any[]>(api, { path: `/missions/${missionId}/proofs`, token: managerToken });
    expect(list.body).toHaveLength(1);
  });

  it("supprime logiquement une preuve et journalise l'opération", async () => {
    const missionId = await missionAssignedTo(driver.userId, "PREUVE-SUPPRESSION");
    const uploaded = await uploadProof(api, managerToken, missionId);

    const driverAttempt = await request(api, {
      method: "DELETE",
      path: `/missions/${missionId}/proofs/${uploaded.body.id}`,
      token: driverToken,
    });
    expect(driverAttempt.status).toBe(403);

    const removed = await request<any>(api, {
      method: "DELETE",
      path: `/missions/${missionId}/proofs/${uploaded.body.id}`,
      token: managerToken,
    });
    expect(removed.status).toBe(200);

    const list = await request<any[]>(api, { path: `/missions/${missionId}/proofs`, token: managerToken });
    const download = await request(api, {
      path: `/missions/${missionId}/proofs/${uploaded.body.id}`,
      token: managerToken,
    });

    expect(list.body).toHaveLength(0);
    expect(download.status).toBe(404);
    expect(await auditActionsFor(db, uploaded.body.id)).toContain("PROOF_DELETED");

    // Suppression logique : la ligne subsiste, le fichier n'est pas effacé par
    // l'API (la purge relève de la procédure de rétention).
    const rows = await db.query<{ deletedAt: string | null }>(
      `SELECT "deletedAt" FROM proof_files WHERE id = $1`,
      [uploaded.body.id]
    );
    expect(rows.rows[0]?.deletedAt).not.toBeNull();
    expect(existsSync(proofPathOnDisk(api, companyId, missionId, uploaded.body.sha256, "png"))).toBe(true);
  });

  it("exige un jeton pour toute manipulation de preuve", async () => {
    const missionId = await missionAssignedTo(driver.userId, "PREUVE-AUTH");
    const list = await request(api, { path: `/missions/${missionId}/proofs` });
    const upload = await request(api, {
      path: `/missions/${missionId}/proofs`,
      body: { mimeType: "image/png", dataBase64: pngBytes().toString("base64") },
    });
    expect(list.status).toBe(401);
    expect(upload.status).toBe(401);
  });
});
