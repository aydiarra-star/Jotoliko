# Contrat d'API — état réel

API NestJS, préfixe d'écoute : `PORT` (défaut `4000`), sur `0.0.0.0`.

Toutes les routes sont couvertes par `ThrottlerGuard` (120 req/min par défaut).
`POST /auth/login` est limité à **5 requêtes/min**. Les mutations financières sont
limitées à 30 req/min.

Aucun endpoint documenté ci-dessous n'est fictif : seuls les endpoints réellement
implémentés figurent ici. Les fonctionnalités absentes (commandes, clients,
tournées, notifications, remises consolidées, paiement mobile money) **ne sont pas
déclarées**.

## Public

### `GET /health`
Vivacité. Ne touche à aucune dépendance.
```json
{ "status": "ok", "service": "jotoliko-api" }
```

### `GET /health/live`
Alias de vivacité. `200`.

### `GET /health/ready`
Disponibilité réelle : exécute `SELECT 1` sur PostgreSQL.
`200` si la base répond, **`503` sinon**.
```json
{ "status": "ready", "service": "jotoliko-api", "checks": { "database": "ok" } }
```

### `POST /auth/login`
Limité à 5 requêtes/minute.
```json
{ "companyId": "<uuid ou slug>", "email": "user@example.com", "password": "********" }
```
Réponse `200` :
```json
{
  "accessToken": "v1.<charge>.<émission>.<signature>",
  "user": { "id": "...", "name": "...", "email": "...", "role": "MANAGER", "companyId": "..." }
}
```
`401 Identifiants invalides` — message **unique** pour tous les cas d'échec
(entreprise inexistante, compte inexistant, compte inactif, mauvais mot de passe,
appartenance absente). Aucune énumération possible.

`role` est lu depuis `Membership → Role`, jamais depuis la requête.

## Authentifié

En-tête requis : `Authorization: Bearer <accessToken>`.

Le jeton est vérifié **et** confronté à la base à chaque requête : compte actif,
`tokenVersion` inchangée, rôle re-résolu, appartenance à l'entreprise revendiquée.
Un rôle retiré ou un compte désactivé invalide immédiatement les jetons en
circulation. `401` dans tous les cas d'échec.

Une ressource appartenant à une autre entreprise renvoie **`404`**, jamais `403` :
cela évite de révéler son existence (cf. `docs/SECURITY-MODEL.md`).

### `GET /missions`
Liste paginée par curseur, filtrée par `companyId`.

| Paramètre | Type | Défaut | Notes |
| --- | --- | --- | --- |
| `status` | statut de mission | — | validé contre l'énumération du domaine |
| `search` | chaîne (≤ 120) | — | `ILIKE` sur `reference` et `clientName`, échappé |
| `cursor` | chaîne opaque | — | `(updatedAt, id)` en base64url |
| `take` | entier 1–100 | 25 | |

Réponse :
```json
{ "items": [ /* MissionView */ ], "nextCursor": "<opaque>|null" }
```

**Un `DRIVER` ne reçoit que les missions qui lui sont affectées.** Le filtre est
appliqué côté serveur.

`MissionView` :
```json
{
  "id": "...", "reference": "CMD-1042", "clientName": "...", "phone": "...",
  "status": "ARRIVE", "assignedUserId": "...", "proofId": "...", "proofRequired": true,
  "money": { "expected": 12000, "collected": 0, "remitted": 0, "difference": 12000 },
  "gps": { "truth": "INDISPONIBLE", "at": null, "latitude": null, "longitude": null },
  "updatedAt": "2026-10-15T10:00:00.000Z"
}
```

> **Fraîcheur et coordonnées.** Corrigé et vérifié par test HTTP : la vue
> recalcule `gps.truth` **à chaque lecture** depuis l'horodatage de mesure, et ne
> renvoie `latitude`/`longitude` que tant que la position est exploitable
> (`truth` différent de `INDISPONIBLE`). Au-delà de 15 minutes, `truth` vaut
> `INDISPONIBLE` et les coordonnées sont `null` : **une position périmée n'est
> jamais présentée comme une position actuelle**. Si aucune mesure n'a jamais été
> enregistrée, `at` vaut également `null`.

### `GET /missions/:id`
`MissionView` ou `404`.

### `POST /missions/:id/transition`
Permission : `transitionMission`. Un `DRIVER` ne peut agir que sur ses missions.
```json
{ "to": "LIVREE", "proofId": "proof-1", "reason": "facultatif", "recordedAt": "2026-10-15T09:58:00Z" }
```
- `400` : statut cible inconnu, preuve manquante alors qu'elle est exigée, motif
  absent pour `ECHEC`/`REPROGRAMMEE`, horodatage illisible.
- `409` : transition interdite par le graphe, ou la mission a changé d'état
  entre-temps (compare-and-swap).
- Transition interdite refusée **même si la requête est envoyée manuellement** :
  le graphe est appliqué côté serveur.

Graphe : `A_AFFECTER → AFFECTEE → EN_ROUTE → ARRIVE → LIVREE` ;
`EN_ROUTE|ARRIVE → ECHEC` ; `LIVREE|ECHEC → REPROGRAMMEE|RETOUR` ;
`REPROGRAMMEE → AFFECTEE` ; `RETOUR` est terminal.

### `POST /missions/:id/payment`
Permission : `collectPayment`. **En-tête `Idempotency-Key` obligatoire** (≥ 8 car.).
```json
{ "collected": 12000, "recordedAt": "2026-10-15T10:00:00Z" }
```
- `400` : montant non entier ou ≤ 0 ; statut ≠ `LIVREE` ; montant > reste dû ;
  clé absente ou trop courte.
- `409` : le montant disponible a changé entre-temps ; ou la même clé a déjà servi
  pour une opération **différente** (l'empreinte de requête diverge).

Rejouer une clé identique avec le même contenu renvoie le résultat mémorisé
**sans créer de second mouvement**.

### `POST /missions/:id/remittance`
Permission : `remitCash`. Un `DRIVER` est refusé (`403`).
**En-tête `Idempotency-Key` obligatoire.**
```json
{ "amount": 11000, "recordedAt": "2026-10-15T11:00:00Z" }
```
- `400` : montant invalide, ou supérieur aux espèces détenues.
- `409` : le disponible a changé, ou clé réutilisée avec un autre contenu.

### `POST /missions/:id/gps`
Permission : `recordGps`. Un `DRIVER` ne peut agir que sur ses missions.
```json
{ "latitude": 14.6928, "longitude": -17.4467, "recordedAt": "2026-10-15T10:00:00Z" }
```
- `400` : latitude hors `[-90, 90]`, longitude hors `[-180, 180]`, horodatage
  illisible, dans le futur au-delà de 5 min, ou plus vieux que 15 min.
- La fraîcheur (`gpsTruth`) est calculée depuis l'horodatage de **mesure** :
  ≤ 60 s `REEL`, ≤ 900 s `DERNIERE_POSITION_CONNUE`, au-delà `INDISPONIBLE` et la
  mesure est refusée à l'écriture.


### `POST /missions/:missionId/proofs`
Permission : `uploadProof` (`OWNER`, `ADMIN`, `MANAGER`, `DRIVER`). Un `DRIVER` ne
peut déposer que sur ses propres missions ; une mission d'une autre entreprise
renvoie `404`.

Le contenu est transmis en base64 dans le corps JSON (aucun analyseur multipart).
```json
{
  "mimeType": "image/jpeg",
  "dataBase64": "<contenu encodé>",
  "type": "PHOTO",
  "recipientName": "Awa Ndiaye",
  "note": "Remis en main propre",
  "latitude": 14.6928,
  "longitude": -17.4467,
  "recordedAt": "2026-10-15T09:58:00Z",
  "clientId": "terrain-preuve-0001"
}
```
- `201` — preuve créée. La réponse décrit la preuve **sans jamais renvoyer son
  contenu** et sans exposer la clé de stockage :
  `{ id, missionId, type, mimeType, sizeBytes, sha256, recipientName, note, recordedAt, createdAt, downloadedBy }`.
- `200` — le dépôt a été rejoué : soit `clientId` déjà connu de l'entreprise, soit
  contenu strictement identique pour la même mission (même empreinte SHA-256). La
  réponse porte alors l'identifiant **déjà existant** : un terrain hors ligne peut
  renvoyer son dépôt sans créer de doublon.
- `400` — contenu vide, ou chaîne qui n'est pas du base64.
- `413` — contenu au-delà de 5 Mio.
- `415` — type déclaré hors `image/jpeg`, `image/png`, `image/webp`,
  `application/pdf`, **ou contenu réel ne correspondant pas au type déclaré**
  (renommer un fichier ne le convertit pas : la signature binaire est vérifiée).
- `403` — rôle sans `uploadProof`, ou mission hors du périmètre du livreur.

Types acceptés et extensions employées : `image/jpeg` → `.jpg`, `image/png` →
`.png`, `image/webp` → `.webp`, `application/pdf` → `.pdf`.

### `GET /missions/:missionId/proofs`
Permission : `readProof` (`OWNER`, `ADMIN`, `MANAGER`, `DRIVER`, `VIEWER`).
Un `DRIVER` ne liste que les preuves de ses propres missions. Les preuves
supprimées (`deletedAt` renseigné) ne figurent pas dans la liste. `200` avec un
tableau — **jamais** le contenu.

### `GET /missions/:missionId/proofs/:proofId`
Permission : `readProof`. Renvoie le contenu en flux, avec
`Content-Type` réel, `Content-Length`, `Cache-Control: private, no-store`,
`Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`.
- `410` — la preuve est référencée mais **absente du stockage**. La ligne est
  conservée : l'incident est signalé explicitement plutôt que servi comme un
  contenu vide.

### `DELETE /missions/:missionId/proofs/:proofId`
Permission : `deleteProof` (`OWNER`, `ADMIN`, `MANAGER`). Suppression **logique**
(`deletedAt`) : la ligne reste auditable et l'opération est tracée (`PROOF_DELETED`).
Le fichier reste sur le disque ; sa purge physique relève de la procédure de
rétention (cf. `docs/SECURITY-MODEL.md`). `200` avec la preuve marquée supprimée.

## Erreurs

| Code | Sens |
| --- | --- |
| `400` | Entrée invalide (validation DTO, règle métier violée) |
| `401` | Authentification absente, expirée, révoquée ou hors périmètre |
| `403` | Rôle insuffisant pour l'opération demandée |
| `404` | Ressource inexistante **ou appartenant à une autre entreprise** |
| `409` | Conflit d'état, de concurrence ou d'idempotence |
| `429` | Limite de requêtes dépassée |
| `503` | Dépendance critique indisponible (`/health/ready`) |

Validation : `whitelist` + `forbidNonWhitelisted` + `forbidUnknownValues`.
Toute propriété non déclarée dans le DTO est **rejetée**, pas ignorée.

## Non implémenté (à ne pas documenter comme disponible)

Commandes, clients, destinataires, tournées, remises de caisse consolidées,
anomalies, notifications (aucun canal n'est configuré), import de données,
rôles/administration, journal d'audit exposé en lecture.

**Paiement mobile money** : aucun fournisseur n'est configuré ni testé. Les
encaissements (`POST /missions/:id/payment`) enregistrent une **déclaration**
d'exploitation (le livreur dit avoir encaissé), pas un mouvement d'argent réel.
Aucune intégration de paiement ne doit être annoncée comme fonctionnelle.

**Stockage des preuves** : implémenté sur un répertoire dédié du serveur
(`PROOF_STORAGE_DIR`), et non sur un stockage objet avec URL signée. Les preuves
ne sont donc jamais accessibles par URL publique : elles passent toutes par l'API
après contrôle du périmètre.

**Sauvegardes** : la procédure existe et est exécutée automatiquement en CI
(`tests/api-e2e/backup-restore.e2e.test.ts` : `pg_dump` puis `pg_restore` dans une
base isolée). Aucune sauvegarde automatique de production n'est configurée : voir
`docs/DEPLOYMENT-ARCHITECTURE.md`.
