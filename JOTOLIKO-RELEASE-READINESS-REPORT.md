# JOTOLIKO — RELEASE READINESS REPORT

**Date** : 2026-10-15
**Branche** : `arena/dd76021f-jotoliko` (depuis `main` = `3b0f3b7`)
**Périmètre** : audit, réconciliation, correction, tests et préparation au pilote
**PR examinée** : [#3](https://github.com/aydiarra-star/Jotoliko/pull/3) — « Jotoliko OS — transformation terrain africaine 2026 »
**PR produite** : [#4](https://github.com/aydiarra-star/Jotoliko/pull/4) — 3/3 vérifications **vertes** (vérifiées sur GitHub Actions)

| Vérification | Résultat | Durée |
| --- | --- | --- |
| `Jotoliko API CI` — API (Prisma, migrations, build) | ✅ **pass** | 1 min 07 |
| `Jotoliko OS CI` — Site + invariants + PostgreSQL embarqué | ✅ **pass** | 44 s |
| `Jotoliko OS CI` — Reality tests sur PostgreSQL 16 réel | ✅ **pass** | 45 s |

> **Aucune affirmation de production.** La décision finale figure en §10 et
> s'appuie uniquement sur des commandes exécutées, dont les résultats sont
> reproduits ci-dessous.

---

## 1. État initial du projet

### 1.1 Ce qui existait réellement

`main` (`3b0f3b7`, merge de la PR #1) contenait **uniquement un site marketing
Next.js 15 en export statique** : 19 routes, contenu éditorial, suivi de livraison
démonstratif, et la documentation produit (`docs/`, `prisma/schema.prisma`).

Ni API, ni application mobile, ni console : `AGENTS.md` le disait explicitement.

### 1.2 La PR #3 n'était pas dans `main`

La PR #3 est **ouverte**, non fusionnée : 43 fichiers, +1201/−17, sur
`chore/jotoliko-os-operations-2026` (`f4bcefe`). Elle apporte une première API
NestJS, un cockpit `/operations`, des invariants métier partagés et 14 documents.

### 1.3 La PR #3 était en échec de CI — reproduit localement

Les deux jobs échouaient. Reproduits sans avoir accès aux journaux GitHub :

| Job | Cause racine exacte |
| --- | --- |
| `Jotoliko API CI` | `@types/express` absent → `TS7016` sur `src/auth/auth.types.ts`, `nest build` échoue. Confirmé : `npx nest build` → `Found 5 error(s)`. Les 4 autres erreurs découlaient d'un `prisma generate` impossible. |
| `Jotoliko OS CI` | La `tsconfig.json` racine incluait `**/*.ts`, donc `apps/api/**` était compilé avec les options du site (aucun décorateur activé) → `TS1241/TS1270/TS1206`. Plus `TS2322` sur `app/operations/page.tsx` (tableau de tuples mélangeant `string` et composants Lucide). |

### 1.4 Défauts supplémentaires trouvés par lecture

- **Deux schémas Prisma divergents** : `prisma/schema.prisma` (modèle MVP
  complet : `Settlement`, `Proof`, `Payment`, `clientId`, `recordedAt/syncedAt`)
  et `apps/api/prisma/schema.prisma` (modèle réduit). **Aucune migration** nulle
  part. Le schéma documenté et le schéma utilisé ne décrivaient pas le même produit.
- **Validation inexistante** : `ValidationPipe({whitelist: true})` était déclaré
  mais `class-validator`/`class-transformer` **n'étaient pas installés** — le pipe
  échoue à l'exécution et aucun DTO n'existait.
- **Faille d'autorisation** : `DRIVER` pouvait faire transitionner, encaisser et
  positionner **n'importe quelle mission de l'entreprise**, affectée à lui ou non.
- **Caisse non bornée** : un encaissement pouvait dépasser `expectedAmount`.
- **Course sur l'idempotence** : la clé était vérifiée *avant* la transaction ;
  sous concurrence, deux requêtes pouvaient passer le contrôle.
- **Audit hors transaction** : écrit après le commit, donc susceptible de
  manquer une mutation réellement appliquée.
- **GPS malhonnête** : une position ancienne était écrite avec `INDISPONIBLE`
  mais ses coordonnées restaient stockées et renvoyées sans datation exploitable.
- **`deploy-pages.yml` absent** bien que référencé par `README.md` et `AGENTS.md`.
- **Aucun test pour l'API**, aucun fichier de verrouillage dans `apps/api`.

### 1.5 Point d'étape brut

#### Inventaire technique (Phase A)

| Domaine | État |
| --- | --- |
| Site marketing Next.js | **TERMINÉ** |
| Invariants métier partagés | **PARTIEL** (5 tests, non branchés) |
| API NestJS | **PARTIEL** (ne compilait pas) |
| Modèle de données Prisma | **PARTIEL** (2 schémas divergents, 0 migration) |
| Authentification / RBAC | **PARTIEL** (faille de périmètre, pas de rate limiting) |
| Isolation multi-entreprise | **PARTIEL** (filtres présents, jamais testés) |
| Caisse & idempotence | **PARTIEL** (course, plafonds absents) |
| Preuves de livraison | **ABSENT** (aucun stockage) |
| Journal d'audit | **PARTIEL** (hors transaction) |
| Interfaces Responsable / Livreur / Vendeur | **PARTIEL** (statiques, honnêtes) |
| Hors ligne / synchronisation | **ABSENT** (documenté seulement) |
| GPS | **PARTIEL** |
| Notifications / WhatsApp | **ABSENT** |
| Tournées / optimisation | **ABSENT** |
| Tests automatisés | **PARTIEL** (34 tests, aucun test d'intégration) |
| CI/CD | **PARTIEL** (2 workflows en échec, déploiement absent) |
| Staging / production | **ABSENT** |

---

## 2. Changements réalisés

Le travail de la PR #3 a d'abord été **intégré verbatim** dans la branche de
travail (commit `29a6d96`), afin de ne rien perdre et de disposer d'une base
auditable. La PR #3 elle-même n'a **pas** été fermée, fusionnée ni modifiée.

### 2.1 Livrer un build reproductible

- `tsconfig.json` racine : `apps/`, `.next`, `dist` exclus du périmètre de
  compilation du site. Le site ne compile plus l'API.
- `app/operations/page.tsx` : KPI typés (`Kpi` + `LucideIcon`) au lieu d'un
  tableau de tuples inféré `(string | LucideIcon)[]`.
- `lib/tracking.ts` : introduction de `GeoPoint` ; `distanceKm` n'exige plus un
  horodatage qu'elle n'utilise pas (**bug de type préexistant sur `main`**).
- `apps/api` : `@types/express`, `class-validator`, `class-transformer`,
  `@nestjs/throttler` déclarés ; `tsconfig` nettoyé ; `start` pointe enfin vers
  l'artefact réellement produit (`dist/apps/api/src/main.js`).
- `apps/api/package-lock.json` ajouté : installation reproductible en CI.
- `vitest.config.ts` : périmètre de test restreint aux sources, `dist` exclu.
- `lint` retiré des scripts : ESLint n'était pas installé et `next lint`
  déclenchait une installation interactive, incompatible avec la CI.

### 2.1 bis Cinq défauts supplémentaires révélés par l'exécution réelle de la CI

Le premier passage des workflows a échoué, et **chaque échec a été diagnostiqué
puis corrigé** — aucun n'a été contourné en désactivant un contrôle. Les
journaux du runner n'étant pas téléchargeables depuis l'environnement d'audit,
les erreurs sont publiées en *annotations*, lisibles via l'API des check-runs.

1. **`prisma/migrations/migration_lock.toml` manquant.** Prisma ne pouvait pas
   déterminer le connecteur : le contrôle de dérive échouait *sans jamais
   comparer le schéma* (`Could not determine the connector from the migrations
   directory`). Fichier normalement créé par `prisma migrate dev` ; absent parce
   que les migrations ont été écrites à la main.
2. **25 `DEFAULT gen_random_uuid()::text` en trop.** Le diff Prisma était
   explicite : `Altered column id (default changed from
   Some(DbGenerated(Some("(gen_random_uuid())::text"))) to None)`.
   `@default(uuid())` est une valeur générée **côté client** : aucun `DEFAULT` ne
   doit exister en base. C'était la source réelle de la dérive, sur chaque table.
3. **`$queryRaw` refuse une chaîne brute.** Le vrai client n'accepte qu'un
   littéral étiqueté ou un fragment `Prisma.Sql`. Les requêtes construites
   dynamiquement sont désormais composées avec `Prisma.sql` / `Prisma.join`,
   donc intégralement paramétrées.
4. **Bug latent de niveau production** : la liste de colonnes était interpolée
   dans un littéral étiqueté, ce qui la transforme en *paramètre lié*. La requête
   aurait produit `SELECT $1 FROM missions` et échoué à l'exécution. Corrigé via
   `Prisma.raw` (constante du code, jamais une entrée utilisateur).
5. **`Parameters<Parameters<PrismaService["$transaction"]>[0]>[0]`** retenait la
   mauvaise surcharge : le vrai `$transaction` est surchargé, donc l'extraction
   désignait la forme tableau et non la forme rappel. Remplacé par le type
   officiel **`Prisma.TransactionClient`**.

De plus, le job « Reality tests sur PostgreSQL 16 réel » a révélé une **régression
que le local ne pouvait pas montrer** : les deux suites de tests ouvrent la même
base externe lorsque `DATABASE_URL` est fourni, et se recréaient mutuellement le
schéma en s'exécutant en parallèle. En local, chaque worker PGlite possède sa
propre base, donc le défaut restait invisible. Les fichiers de test s'exécutent
désormais séquentiellement.

> Ces cinq points illustrent la valeur du contrôle : le substitut local, trop
> permissif, avait laissé passer les points 3, 4 et 5. Il dérive maintenant sa
> surface SQL brute du **runtime Prisma réel** livré avec le paquet, et non plus
> d'une réimplémentation approximative.

### 2.2 Faire converger le modèle de données

- **Un seul schéma Prisma** : `prisma/schema.prisma`. Le doublon
  `apps/api/prisma/schema.prisma` est supprimé **après fusion** de ses apports
  réels (`Mission`, `TruthStatus`, `MissionStatus`, `MutationKey`).
- `User` reçoit `passwordSalt` (sel aléatoire par utilisateur) et `tokenVersion`
  (révocation immédiate des jetons).
- `AuditLog` reçoit `requestId` (corrélation requête ⇄ trace) et `source`.
- `CashMovement` : **journal immuable des espèces**. Les compteurs de `Mission`
  redeviennent des caches de lecture ; la vérité comptable est le journal, ce qui
  rend un écart de caisse explicable ligne à ligne.
- `MutationKey` : `@@unique([companyId, operation, idempotencyKey])` — l'unicité
  est cloisonnée par entreprise *et* par opération, plus une empreinte de requête.
- **Deux migrations versionnées** couvrant **les 25 modèles et les 10 énumérations**
  du schéma : `20261015000000_init_operational_core/` (socle multi-entreprise,
  couche opérationnelle, caisse, idempotence, audit) et
  `20261015120000_mvp_catalogue_and_delivery/` (référentiels, commandes,
  livraison, preuves, paiements, remises, notifications, réglages).
  Détail de la première :
  avec contraintes portées par le moteur :
  `CHECK (remittedAmount <= collectedAmount)`, montants `>= 0`, latitude
  `[-90, 90]`, longitude `[-180, 180]`, unicité `(companyId, reference)`,
  unicité de la clé d'idempotence des espèces.

### 2.3 Sécurité

- **Autorisation au niveau domaine** (`lib/jotoliko-os/core.ts`) : matrice
  `PERMISSIONS`, `assertAllowed`, et surtout `assertCanActOnMission` — un livreur
  n'agit que sur **sa** mission. Côté serveur, pas dans l'interface.
- **Le rôle n'est jamais cru sur parole** : il est re-résolu depuis
  `Membership → Role` à chaque requête (`RoleResolver`). Un rôle retiré en base
  invalide les jetons en circulation.
- **Jetons** (`lib/jotoliko-os/auth.ts`) : `v1.<charge>.<émission>.<signature>`,
  signature HMAC-SHA256 en comparaison à temps constant, TTL 8 h, décalage
  d'horloge toléré 60 s, `tv` (version de jeton) pour révocation. La vérification
  **ne lève jamais** : elle retourne une raison explicite.
- **Anti-force brute** : `@Throttle(5/60 s)` sur `POST /auth/login`, 120 req/min
  par défaut sur toute l'API (`ThrottlerGuard` global).
- **Anti-énumération** : message unique pour tous les échecs de connexion ; le
  mot de passe est vérifié **avant** le contrôle d'appartenance ; le rôle est lu
  après authentification.
- **Mots de passe** : scrypt, sel aléatoire par utilisateur, comparaison à temps
  constant, longueur maximale bornée (évite un déni de service par coût CPU).
- **Validation** : DTO `class-validator` réels + `forbidNonWhitelisted` +
  `forbidUnknownValues` — les propriétés non déclarées sont rejetées.
- **Configuration fail-fast** (`apps/api/src/config.ts`) : refus de démarrer si
  `DATABASE_URL` n'est pas PostgreSQL, si `AUTH_SECRET` fait moins de 32
  caractères, s'il reste à une valeur d'exemple en production, ou si `CORS_ORIGIN`
  est vide. Plus de repli CORS permissif. `*` interdit en production.
- **CORS** limité aux origines déclarées ; en-têtes autorisés explicités ;
  `X-Content-Type-Options: nosniff` et `Referrer-Policy: no-referrer`.
- **Non-fuite d'existence** : 404 (et non 403) pour une ressource d'un autre
  tenant.

### 2.4 Caisse correcte sous concurrence

Chaque mutation financière tient dans **une transaction** contenant :

1. verrou de ligne (`SELECT … FOR UPDATE`) ;
2. mise à jour conditionnelle *compare-and-swap*, la comparaison
   (`collectedAmount + montant <= expectedAmount`) étant évaluée **par la base** ;
3. écriture du mouvement d'espèces ;
4. écriture de l'audit ;
5. écriture de la clé d'idempotence.

Conséquences : une transaction échouée ne laisse ni mouvement, ni clé, ni audit ;
une clé rejouée avec un contenu différent est **refusée** (`409`) au lieu de
renvoyer silencieusement un résultat qui ne correspond pas à la demande ; une
course perdue sur la clé est absorbée comme un rejeu légitime.

### 2.5 Honnêteté des données (règle non négociable d'AGENTS.md)

- GPS : la fraîcheur est calculée depuis l'horodatage de **mesure**, jamais depuis
  l'heure d'arrivée. Une mesure de plus de 15 min est refusée à l'écriture ; une
  mesure dans le futur au-delà du décalage toléré est refusée.
- `/health` (vivacité) ne touche pas aux dépendances ; `/health/ready` vérifie
  réellement PostgreSQL et renvoie `503` sinon.
- Le cockpit `/operations` reste explicitement en « Mode démonstration » : aucune
  donnée serveur n'est inventée pour donner l'impression d'un système branché.

### 2.6 Hors ligne

`lib/jotoliko-os/offline-queue.ts` : file persistante, états
`EN_ATTENTE / SYNCHRONISATION / SYNCHRONISE / ECHEC`, déduplication par
`clientId`, backoff exponentiel plafonné, reprise après coupure, et surtout
**aucune confirmation sans accusé de réception serveur**. L'horodatage de
l'appareil est conservé distinct de celui du serveur.

### 2.7 CI/CD

- `jotoliko-os-ci.yml` : installation reproductible, typecheck, tests, build ;
  plus un job séparé sur **conteneur `postgres:16`** pour la concurrence réelle.
- `jotoliko-api-ci.yml` : validation du schéma, génération Prisma, application des
  migrations, **détection de dérive** (`prisma migrate diff --exit-code`),
  typecheck, build, vérification du point d'entrée, audit informatif.
- `deploy-pages.yml` **restauré** (il était référencé mais absent), avec
  `typecheck` + `test` avant publication et création de `.nojekyll` — sans quoi
  GitHub Pages ignorerait `_next/` et tous les assets renverraient 404.

---

## 3. Fichiers et modules modifiés

**73 fichiers, +11639 / −389** (dont le contenu intégral de la PR #3).

| Zone | Contenu |
| --- | --- |
| `lib/jotoliko-os/core.ts` | Réécrit : statuts, permissions, transitions, caisse, GPS, idempotence. Sans Prisma, sans NestJS, sans DOM. |
| `lib/jotoliko-os/auth.ts` | **Nouveau** — jetons signés, testables sans serveur. |
| `lib/jotoliko-os/offline-queue.ts` | **Nouveau** — file terrain persistante. |
| `lib/tracking.ts` | `GeoPoint` ; `distanceKm` assoupli. |
| `prisma/schema.prisma` | Schéma canonique unique, étendu et documenté. |
| `prisma/migrations/20261015000000_init_operational_core/migration.sql` | **Nouveau** — DDL, enums, index, contraintes. |
| `apps/api/src/**` | Réécrit : `config.ts`, `main.ts`, `app.module.ts`, `prisma.module.ts`, `auth/**` (dont `role-resolver.ts`, `dto/`), `missions/**` (service + contrôleur + 5 DTO), `common/request-id.middleware.ts`, `health.controller.ts`. |
| `apps/api/prisma/` | **Supprimé** (schéma dupliqué, fusionné à la racine). |
| `apps/api/{package.json,tsconfig.json,nest-cli.json,.env.example,package-lock.json}` | Assainis ; `scripts/local-prisma-stub.mjs` ajouté (outil local documenté). |
| `tests/reality/*` | **Nouveaux** — `domain.reality.test.ts` (50), `database.reality.test.ts` (23), `sql-client.ts`. |
| `.github/workflows/*` | 2 workflows corrigés, `deploy-pages.yml` restauré. |
| `tsconfig.json`, `vitest.config.ts`, `package.json`, `.gitignore` | Corrigés. |

---

## 4. Tests exécutés et résultats observés

Toutes les commandes ci-dessous ont été exécutées dans cet environnement ; les
sorties sont reproduites fidèlement.

| Commande | Résultat observé |
| --- | --- |
| `npm test` | **5 fichiers, 114 réussis, 1 ignoré, 0 échec** |
| `npm run typecheck` | **0 erreur** |
| `npm run build` (site) | **« ✓ Compiled successfully »**, « ✓ Exporting (2/2) », 19 routes exportées |
| `npm run api:typecheck` | **0 erreur** |
| `npm run api:build` | succès ; `dist/apps/api/src/main.js` présent |
| `npm run test:db` | 23 tests, 1 ignoré (concurrence exécutée en CI) |
| GitHub Actions (PR #4) | **3/3 vérifications vertes** |

### Détail des fichiers de test

| Fichier | Tests | Base |
| --- | --- | --- |
| `lib/tracking.test.ts` | 29 | — |
| `lib/jotoliko-os/core.test.ts` | 5 | — |
| `tests/reality/domain.reality.test.ts` | 50 | — |
| `tests/reality/database.reality.test.ts` | 23 (+1 ignoré en local) | **PostgreSQL 16.4 réel** |
| `tests/reality/schema-drift.test.ts` | 8 | **PostgreSQL 16.4 réel** |

Les tests de base de données s'exécutent sur du **vrai PostgreSQL** :
`select version()` → `PostgreSQL 16.4 on x86_64-pc-linux-gnu`. Les contraintes
`23505` (unicité) et `23514` (`CHECK`) sont réellement levées par le moteur, et
l'annulation de transaction est réellement observée. Il n'y a **aucune imitation
de base de données**.

Le test #13 d'entrelacement de deux connexions simultanées est **ignoré** en
local (PGlite est mono-connexion) et **s'exécute réellement en CI** sur
`postgres:16` : la vérification « Reality tests sur PostgreSQL 16 réel » est
verte, ce qui signifie que les deux insertions concurrentes ont bien été jouées,
que la contrainte d'unicité a arbitré la course, et qu'exactement un mouvement
d'espèces a été créé. Il n'est pas simulé.

### Ce qui n'a PAS pu être exécuté ici

| Élément | Raison locale | État vérifié |
| --- | --- | --- |
| `prisma validate` | `binaries.prisma.sh` inaccessible (hôte hors du périmètre réseau autorisé) | ✅ **exécuté en CI — succès** |
| `prisma generate` | idem | ✅ **exécuté en CI — succès** |
| `prisma migrate deploy` | idem | ✅ **exécuté en CI sur `postgres:16` — succès** |
| `prisma migrate diff` (dérive) | idem | ✅ **exécuté en CI — succès, aucune dérive** |
| Concurrence réelle, 2 connexions | PGlite mono-connexion | ✅ **exécutée en CI sur `postgres:16` — succès** |
| `npm ci` sur runner propre | non applicable localement | ✅ **exécuté en CI — succès** |

La détection de dérive est donc vérifiée **par deux chemins indépendants** :
`prisma migrate diff --exit-code` (CI, moteurs Prisma réels) et
`tests/reality/schema-drift.test.ts` (partout, introspection du catalogue
PostgreSQL).

Pour ne pas laisser l'API non vérifiable, un **substitut de types** est dérivé du
schéma réel par `node apps/api/scripts/local-prisma-stub.mjs` (25 modèles,
10 énumérations). Il est documenté, jamais utilisé en CI, et ses limites sont
écrites dans son en-tête.

---

## 5. Builds et déploiements réellement effectués

| Élément | État |
| --- | --- |
| Build du site (export statique) | ✅ exécuté, 19 routes |
| Build de l'API | ✅ exécuté, artefact présent |
| Migration appliquée sur PostgreSQL réel | ✅ exécutée (PGlite, PostgreSQL 16.4) |
| Déploiement en staging | ❌ **non effectué** — aucun environnement de staging n'existe ni n'est accessible |
| Déploiement en production | ❌ **non effectué** — volontairement, aucune autorisation et aucun environnement cible |
| Vérifications CI (3 jobs) | ✅ **exécutées et vertes** sur GitHub Actions — voir PR [#4](https://github.com/aydiarra-star/Jotoliko/pull/4) |
| Publication GitHub Pages | ⚠️ workflow restauré ; il ne se déclenche que sur `main`, donc **la publication réelle n'a pas été déclenchée** depuis cette branche |

---

## 6. Fonctionnalités validées

Validées par une exécution observée, pas par la présence d'un fichier :

- Invariants de statut : `ARRIVE` pivot, `RETOUR` terminal, transitions interdites refusées.
- Autorisation par rôle et **périmètre par mission** (un livreur ne sort pas de ses missions).
- Jeton expiré / altéré / forgé / révoqué refusé ; rôle re-résolu en base.
- Encaissement conditionné à `LIVREE`, borné par le reste dû.
- Remise interdite au livreur, bornée par les espèces détenues.
- Idempotence garantie par contrainte de base, cloisonnée par entreprise et opération.
- Atomicité : une transaction échouée ne laisse ni montant, ni mouvement, ni audit.
- Isolation multi-entreprise des missions et des références de preuve.
- Fraîcheur GPS classée, coordonnées bornées dans le domaine **et** en base.
- Journal d'audit corrélé (`requestId`), conservé après suppression de l'utilisateur.
- Migration reproductible + garde-fou automatique anti-dérive schéma ⇄ migration.
- File hors ligne : jamais de confirmation sans accusé de réception serveur.
- Site marketing : build, export statique, 19 routes.

---

## 7. Fonctionnalités partielles ou absentes

**Partielles**

- **Preuves de livraison** : le champ `proofId` est validé et exigé à la clôture,
  mais il n'existe **aucun stockage objet privé**, aucun contrôle de type/taille de
  fichier, aucune URL signée. La preuve est une référence, pas un fichier.
- **Politique de preuve** : codée en dur à « exigée » dans le service. Elle devrait
  provenir des réglages de l'entreprise (`Setting.proofRequired`).
- **Livreurs** : le lien `User ↔ Driver` n'est pas exploité ; `Driver`, `Vehicle`,
  `Zone`, `Customer` existent dans le schéma mais aucun module ne les sert.
- **Cockpit `/operations`** : statique, en mode démonstration assumé, non branché à l'API.
- **GPS** : écriture et datation correctes, mais aucune restitution de la dernière
  position connue côté service, et pas de consultation temps réel.
- **Observabilité** : journalisation NestJS applicative et identifiant de
  corrélation ; pas de métriques, pas d'alerting, pas de suivi de file.
- **Modèle MVP documenté** : les tables `Order`, `OrderItem`, `Delivery`, `Proof`,
  `Payment`, `Settlement`, `Customer`, `Zone`, `Role`, `Membership` existent dans
  le schéma mais **ne sont pas migrées** et aucun code ne les interroge. La
  migration ne couvre que le socle multi-entreprise et la couche opérationnelle.
- **`Order` / `Mission`** : deux représentations de la même réalité cohabitent.
  À unifier.

**Absentes**

- Stockage des preuves (objet privé + URL signées).
- Modules commandes, clients, tournées, remises de caisse consolidées, anomalies,
  notifications, import de données.
- Notifications (aucun canal configuré) et connecteurs WhatsApp.
- Optimisation de tournées.
- Application mobile native / PWA installable.
- Environnement de staging.
- Tests de bout en bout via HTTP sur l'API.

---

## 8. Dépendances externes restantes

| Dépendance | Objet | État |
| --- | --- | --- |
| `binaries.prisma.sh` | Moteurs Prisma CLI | **Bloqué dans l'environnement d'audit** — accessible en CI |
| PostgreSQL managé (staging, production) | Base réelle | **Manquant** |
| `AUTH_SECRET` de production (≥ 32 car.) | Signature des jetons | **Manquant** (aucun secret affiché ni généré ici) |
| Stockage objet S3-compatible | Preuves de livraison | **Manquant** |
| Fournisseur de paiement mobile money | Wave / Orange Money | **Manquant** — aucun mode électronique n'est déclaré fonctionnel |
| Domaine + secrets GitHub Pages | Publication | Partiellement existant (`gh-pages` alimenté manuellement) |

Aucun secret, jeton ou donnée personnelle n'est présent dans le dépôt ou dans ce
rapport. `AUTH_SECRET=""` est volontairement vide dans `.env.example`.

---

## 9. Risques résiduels

| # | Risque | Gravité | Mitigation / état |
| --- | --- | --- | --- |
| R1 | Aucun test HTTP sur les contrôleurs API | **Élevée** | Règles couvertes au niveau domaine et base ; la couche NestJS n'est pas testée. À faire avant pilote. |
| R2 | Preuves de livraison non stockées | **Élevée** | Une livraison peut être validée avec une référence de preuve non vérifiable. Stockage objet requis. |
| R3 | Tables du modèle MVP non migrées | **Résolu** | ✅ Migration 0002 : les **25 tables** et **10 énumérations** du schéma sont migrées. Dérive surveillée par deux contrôles indépendants. |
| R4 | Concurrence non vérifiée localement | **Faible** | ✅ **Vérifiée en CI** sur `postgres:16` (job vert) : deux insertions simultanées, une seule acceptée par la contrainte d'unicité. |
| R5 | `prisma generate`/`migrate` non exécutables en local | **Faible** | ✅ **Exécutés en CI — succès**, y compris `migrate deploy` sur base vierge et `migrate diff` sans dérive. Le chemin `output` du générateur est donc validé par l'exécution. |
| R6 | Double modèle `Order` / `Mission` | **Moyenne** | Documenté ; à unifier avant d'ouvrir les commandes. |
| R7 | Politique de preuve codée en dur | **Faible** | Valeur la plus sûre (preuve exigée) ; à brancher sur `Setting`. |
| R8 | Aucune observabilité de production | **Moyenne** | Corrélation présente ; métriques, alertes et suivi de file absents. |
| R9 | Aucune sauvegarde/restauration testée | **Élevée pour la production** | `docker-compose.yml` fournit PostgreSQL+Redis ; aucune procédure de sauvegarde n'existe. |
| R10 | `lint` retiré, ESLint non configuré | **Faible** | Choix explicite : `next lint` tentait une installation interactive. À réintroduire proprement. |

---

## 10. Décision finale

### **NOT READY** — pour la production
### **READY FOR PILOT TECHNIQUE** — sous conditions

**Justification de « NOT READY » en production.** Les critères de sortie exigés ne
sont pas tous satisfaits par des preuves vérifiables : aucun environnement de
staging n'existe, aucune sauvegarde/restauration n'a été testée, les preuves de
livraison ne sont pas stockées, et aucun test HTTP ne couvre les contrôleurs. La
règle de la roadmap — « aucun passage en production sans preuve d'exécution des
reality tests » — est respectée pour le **domaine, la base et la chaîne de CI**,
mais pas pour la chaîne applicative complète (HTTP de bout en bout).

**Ce qui autorise un pilote technique.** Les invariants critiques sont désormais
**exécutés et prouvés**, et la chaîne CI est verte de bout en bout :

- 114 tests réussis (1 ignoré en local, exécuté en CI), sur un **PostgreSQL 16 réel** ;
- isolation multi-entreprise, refus d'un jeton expiré, interdiction de la remise
  au livreur, encaissement conditionné et borné par la base, atomicité de la
  caisse, audit corrélé et conservé ;
- **concurrence réellement parallèle** arbitrée par une contrainte de base (CI) ;
- migrations appliquées sur base vierge, `prisma validate`/`generate`/`deploy`
  réussis, **aucune dérive** schéma ⇄ migrations, par deux contrôles indépendants ;
- typecheck et build verts pour le site **et** pour l'API.

Les deux workflows de la PR #3, tous deux en échec, sont aujourd'hui verts. Cinq
défauts supplémentaires n'ont été découverts qu'en exécutant réellement la CI
(§2.1 bis) : ils sont corrigés, aucun n'a été masqué en désactivant un contrôle.

**Conditions avant tout pilote** (par ordre d'importance) :

1. Ajouter des tests HTTP de bout en bout sur l'API (couverture R1) et les
   exécuter contre PostgreSQL.
2. Mettre en place un staging distinct avec sa propre base et ses propres secrets.
3. Implémenter le stockage privé des preuves (type, taille, accès, URL signées).
4. Écrire et **tester** une procédure de sauvegarde/restauration.
5. ~~Confirmer sur le premier run de CI~~ — **fait** : `validate`, `generate`,
   `migrate deploy` et `migrate diff` réussissent, sans dérive.
6. Brancher `Setting.proofRequired` au lieu de la valeur codée en dur.
7. Alimenter `gps.at` / `gps.latitude` / `gps.longitude` dans `MissionView`
   (actuellement renvoyés à `null` alors que les colonnes sont lues).

**Ce qui n'est pas affirmé.** Aucune conformité juridique n'est garantie : les
obligations applicables (protection des données, conservation des preuves,
géolocalisation des livreurs) dépendent du territoire et du modèle économique et
doivent être validées par une revue dédiée. Aucun paiement électronique n'est
déclaré fonctionnel. Aucun chiffre de performance ou d'amélioration n'est avancé.

---

## Annexe — Reproduire ces vérifications

```bash
git clone https://github.com/aydiarra-star/Jotoliko.git
cd Jotoliko
git checkout arena/dd76021f-jotoliko

npm install

npm run typecheck     # 0 erreur
npm test              # 114 réussis, 1 ignoré
npm run build         # export statique, 19 routes

npm --prefix apps/api install
npm run api:typecheck # 0 erreur
npm run api:build     # dist/apps/api/src/main.js

# Reality tests contre un PostgreSQL réel, concurrence comprise
DATABASE_URL=postgresql://user:pass@localhost:5432/jotoliko_test npm test
```

Démarrage de l'API :

```bash
cd apps/api
export DATABASE_URL="postgresql://jotoliko:jotoliko@localhost:5432/jotoliko"
export AUTH_SECRET="$(openssl rand -hex 32)"
export CORS_ORIGIN="http://localhost:3000"
npm run prisma:migrate:deploy
npm run start
```
