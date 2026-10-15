# JOTOLIKO — RELEASE READINESS REPORT

**Date** : 2026-10-15
**Branche** : `arena/dd76021f-jotoliko` (depuis `main` = `3b0f3b7`)
**Périmètre** : audit, réconciliation, correction, tests réels, préparation au pilote
**PR produite** : [#4](https://github.com/aydiarra-star/Jotoliko/pull/4) — **4/4 vérifications vertes**
**PR préservée** : [#3](https://github.com/aydiarra-star/Jotoliko/pull/3) — intacte
**Ampleur** : 97 fichiers, +17 716 / −408 lignes depuis `main`

> **Principe de rédaction.** Chaque affirmation de ce rapport renvoie à une
> commande exécutée ou à une vérification CI consultable. Ce qui n'a pas été
> exécuté est écrit comme non exécuté. **Aucune affirmation de production.**

---

## 1. Décision

### **NOT READY — production**

Non déployable en production. Aucune production n'existe, aucune sauvegarde
planifiée n'est en place, la politique de rétention des pièces justificatives
n'est pas arrêtée, aucune supervision n'est configurée, et l'objectif de reprise
(RTO/RPO) n'a jamais été mesuré.

### **READY FOR TECHNICAL PILOT — sous conditions**

Le socle technique est démontré par l'exécution : **107 tests HTTP de bout en
bout** sur un **PostgreSQL 16 réel**, avec le serveur tel qu'il est livré
(`node apps/api/dist/apps/api/src/main.js`), les vrais gardes, la vraie
validation et le vrai client Prisma — **107 réussis, 0 échec, 0 ignoré**. La
restauration d'une sauvegarde est réellement exécutée en CI (`pg_dump` puis
`pg_restore` dans une base isolée, avec contrôle des données, des contraintes et
des relations).

Un pilote **technique** — équipe restreinte, périmètre limité, objectif de
validation terrain, tolérance aux incidents — est soutenable **aux conditions du
§ 11.1**.

### **NOT READY — pilote opérationnel contrôlé**

Un pilote opérationnel (livraisons réelles, espèces réelles, preuves faisant
foi) exige un environnement de staging validé, une sauvegarde **base + volume**
vérifiée par une restauration, une politique de rétention arrêtée et des sondes
branchées. **Aucun de ces quatre éléments n'existe**, et ils dépendent de
ressources externes non fournies (§ 7). Les conditions sont listées au § 11.2.

---

## 2. État initial vérifié

- La PR #3 n'était pas dans `main` ; la branche en hérite (`29a6d96`) et la PR #3
  est **laissée ouverte et intacte**.
- Sa CI était rouge. La cause a été reproduite localement, puis corrigée.
- Inventaire de départ : schéma Prisma déclarant **25 modèles / 10 énumérations**
  alors que les migrations n'en créaient qu'une partie ; aucun test HTTP ; aucune
  preuve de livraison stockée ; GPS renvoyant systématiquement `null` ; `403`
  confondus avec `500` sur les violations de périmètre.
- État final du schéma : **26 modèles** (la table `proof_files` a été ajoutée par
  la migration `20261015180000_proof_delivery_storage`, additive).

---

## 3. Changements réalisés (commits)

### 3.1 Rendre le dépôt constructible, testable et sûr

`6f9ed84`, `8ed83b6`, `dda210f`, `941fcb0`, `6ec44fa`, `7e652b1` — migration du
modèle MVP documenté, suppression des `DEFAULT uuid()` en base (source réelle de
la dérive schéma ⇄ migrations), garde-fou anti-dérive exécutable sans binaires
Prisma, composition du SQL via `Prisma.Sql` et colonnes en SQL littéral.

### 3.2 Industrialisation de la CI

`30fb88c`, `48dfa56`, `a588630`, `7a612f1` — typecheck lisible (erreurs publiées
en annotations), suites base séquentielles, type de transaction officiel, échecs
e2e publiés en annotations et en artefact, **bilan des tests exécutés publié en
annotation même en cas de succès** (le nombre de cas exécutés est vérifiable via
l'API GitHub, sans télécharger d'artefact).

### 3.3 Suite HTTP de bout en bout et GPS

`fc04dbe` — création de la suite HTTP (auth, missions, caisse, GPS, isolation,
sécurité, limitation de débit) contre l'API réellement démarrée ; **correction du
GPS** : la vue recalcule la fraîcheur à chaque lecture et n'expose les
coordonnées que tant qu'elles sont exploitables ; violations de périmètre
converties en `403` (elles produisaient un `500`).

### 3.4 Stockage réel des preuves

`9488140` — table `proof_files` + migration additive ; module
`apps/api/src/proofs/**` ; validation par **signature binaire** ; écriture
atomique `0600` ; clé déterministe `<entreprise>/<mission>/<empreinte>.<ext>` ;
routes `POST/GET/DELETE /missions/:id/proofs[/:proofId]` ; flux de téléchargement
non mis en cache ; `410` si le fichier manque (ligne conservée) ; suppression
logique auditée ; **pagination réparée** (le curseur produit par l'API faisait 84
caractères pour un DTO qui le bornait à 64 : toute deuxième page renvoyait `400`).

### 3.5 Cette phase finale

| Commit | Objet |
| --- | --- |
| `3e31499` | Démarrage réel de l'API vérifié : `ProofsModule` ne fournissait pas les dépendances de la garde ; substitut Prisma local rendu exécutable ; identifiant de corrélation posé avant l'analyse du corps ; premier contrôle HTTP hors ligne |
| `53b5d79` | Contrôle hors ligne étendu : `X-Forwarded-For` ignoré sans proxy déclaré (pas de contournement de la limitation) et honoré derrière un proxy déclaré ; exécution en CI |
| `4fb3518` | **Correction de la cause racine du dépôt de preuves** (§ 4.1) ; démarrage résilient à une base indisponible ; diagnostics 5xx |
| `1b9e5ce` | Contrat d'API, modèle de sécurité et architecture de déploiement réécrits sur l'état réel ; `.env.example` réduit aux variables réellement lues ; deux attentes fausses de la suite de sauvegarde corrigées |
| `7a612f1` | Bilan des tests publié en annotation, succès compris |

---

## 4. Défauts corrigés

### 4.1 Le dépôt de preuve échouait en `500` pour **tout** fichier

**Symptôme.** En CI, `POST /missions/:id/proofs` renvoyait `500` ; les contrôles
suivants (liste, téléchargement, non-duplication) échouaient en cascade.

**Cause racine, démontrée.** La validation d'un segment de clé de stockage le
bornait à 64 caractères, alors que la clé composée par `keyFor`
(`<empreinte SHA-256>.<extension>`) en fait **68** (jpg/png/pdf) ou **69** (webp).
Le contrôle refusait donc toute écriture, avec un `500` muet
(« Clé de stockage invalide »). Le schéma, la migration, la table et les tests de
schéma étaient corrects : c'est l'accord entre la composition de la clé et sa
validation qui manquait.

**Portée.** Cette fonctionnalité — le stockage réel des preuves, exigence
centrale de la mission — était **entièrement inopérante** tout en donnant une CI
verte sur tout le reste. C'est l'illustration exacte de la règle « la compilation
n'est pas la preuve du fonctionnement ».

**Correction.** La borne est **déduite** de ce que `keyFor` produit réellement
(`MAX_STORAGE_SEGMENT_LENGTH = 69`, constante exportée et justifiée), et le
message nomme le segment refusé. Ajout de `tests/unit/proof-storage.test.ts`
(14 cas, sans base de données) qui compose la clé **réelle** avant de la valider,
vérifie l'aller-retour disque avec empreinte recalculée, les permissions `0600`,
l'absence de fichier temporaire, l'idempotence du chemin et le refus de toute
sortie du répertoire. **Vérifié** : ce test échoue (6 cas) avec l'ancienne borne
et passe avec la nouvelle.

### 4.2 L'API ne pouvait pas se déclarer « non prête »

`PrismaService.onModuleInit` laissait un échec de connexion faire sortir le
processus. Conséquences réelles : la branche dégradée **documentée et
implémentée** de `/health/ready` (`503`, `checks.database = "unreachable"`) était
**inatteignable** ; une coupure passagère de la base faisait repartir le service
en boucle de redémarrage ; et le contrôle hors ligne échouait en CI (il passe avec
un substitut qui ne se connecte jamais réellement — le contrôle était donc
trompeur au moment précis où il comptait).

La disponibilité de la base n'est plus une condition de démarrage : tentative
bornée à 10 s, erreur journalisée, `/health/ready` renvoie `503`. **La
configuration, elle, reste bloquante** (secret absent ou trop court, `CORS_ORIGIN`
implicite, `PORT` invalide, répertoire de preuves inutilisable ⇒ pas de démarrage).

### 4.3 Défauts corrigés lors des phases précédentes

- **Pages 2+ de la liste des missions impossibles** : le curseur produit (84
  caractères) dépassait la borne `@MaxLength(64)` du DTO ⇒ `400` systématique.
- **GPS jamais renvoyé** : `gps.at`, `latitude`, `longitude` valaient `null` en
  permanence malgré des colonnes lues ; une position périmée pouvait être
  présentée comme actuelle. Corrigé : fraîcheur recalculée à la lecture,
  coordonnées exposées seulement tant qu'elles sont exploitables.
- **Violations de périmètre en `500`** : un livreur agissant hors de ses missions
  produisait une erreur interne au lieu d'un refus `403`.
- **API impossible à démarrer dès que les routes de preuves existaient** :
  `ProofsModule` déclarait son contrôleur sans fournir les dépendances de la
  garde (`AuthGuard` attend `RoleResolver`).
- **Substitut Prisma local générant du JavaScript invalide** (`company: any;`) :
  l'API ne pouvait pas démarrer hors ligne, donc aucun contrôle local n'était
  possible.

---

## 5. Tests exécutés — quoi, où, résultat

### 5.1 Bout en bout, sur PostgreSQL 16 réel (CI)

Job « Tests HTTP de bout en bout (API + PostgreSQL 16) » —
[run 38714436073 / job 116353553109](https://github.com/aydiarra-star/Jotoliko/actions/runs/38714436073/job/116353553109)
— **pass**, 1 min 32.

Le serveur est démarré **tel qu'il est livré** et interrogé par de vraies requêtes
HTTP : chaîne garde d'authentification → garde de permissions → validation →
service → Prisma → SQL → contraintes. **Aucune imitation de base, de garde ou de
service.**

Bilan publié par la CI elle-même (annotation `E2E-BILAN`, vérifiable) :

> cas exécutés : **107** — réussis : **107** — échoués : **0** — ignorés : **0**

| Fichier | Cas | Couverture |
| --- | --- | --- |
| `auth.e2e.test.ts` | 16 | connexion, jeton absent/expiré/futur/mal signé/altéré, révocation, compte inactif |
| `missions.e2e.test.ts` | 22 | création, affectation, transitions autorisées **et refusées**, preuve exigée avant clôture, pagination par curseur |
| `cash.e2e.test.ts` | 15 | encaissement, remise, concurrence, idempotence, non-duplication |
| `gps.e2e.test.ts` | 13 | coordonnées valides, hors bornes, données absentes, position périmée |
| `isolation.e2e.test.ts` | 10 | cloisonnement entre entreprises (`404`, jamais `403`) |
| `proofs.e2e.test.ts` | 15 | dépôt, **fichier réellement sur le disque (empreinte recalculée)**, absence de contenu dans les métadonnées, en-têtes de téléchargement, `415`/`413`/`400`, non-duplication, `410`, suppression logique, périmètre |
| `security.e2e.test.ts` | 12 | CORS, en-têtes, validation stricte, non-divulgation |
| `rate-limit.e2e.test.ts` | 2 | quota respecté, en-tête `X-Forwarded-For` |
| `backup-restore.e2e.test.ts` | 2 | **sauvegarde et restauration réellement exécutées** (§ 7.2) |

### 5.2 Autres vérifications CI (toutes vertes)

| Vérification | Résultat | Durée | Lien |
| --- | --- | --- | --- |
| API (Prisma, migrations, build) | ✅ pass | 1 min 31 | [job](https://github.com/aydiarra-star/Jotoliko/actions/runs/38714436073/job/116353553340) |
| Tests HTTP de bout en bout (API + PostgreSQL 16) | ✅ pass | 1 min 32 | [job](https://github.com/aydiarra-star/Jotoliko/actions/runs/38714436073/job/116353553109) |
| Reality tests sur PostgreSQL 16 réel | ✅ pass | 57 s | [job](https://github.com/aydiarra-star/Jotoliko/actions/runs/38714436182/job/116353553427) |
| Site + invariants + PostgreSQL embarqué | ✅ pass | 1 min 1 | [job](https://github.com/aydiarra-star/Jotoliko/actions/runs/38714436182/job/116353553922) |

Le job API exécute en plus, sur une base migrée par `prisma migrate deploy` :
validation du schéma, génération du client, détection de dérive, typecheck
(erreurs publiées en annotations), build, vérification du point d'entrée démarré
et **contrôle HTTP hors ligne** (24 vérifications, § 5.4).

**Aucun test n'est ignoré en CI** : le bilan indique `ignorés : 0`.

### 5.3 Vérifications locales (cet environnement)

| Commande | Résultat observé |
| --- | --- |
| `npm test` | **6 fichiers — 128 réussis, 1 ignoré, 0 échec** (129 cas) |
| `npm run typecheck` | **0 erreur** |
| `npm run api:typecheck` | **0 erreur** |
| `npm run api:build` | succès (`dist/apps/api/src/main.js`) |
| `npm run api:smoke` | **24 / 24 contrôles réussis** |
| `npm run build` (site) | non exécutable ici (polices Google hors périmètre réseau) → **exécuté en CI — succès**, voir job « Site + invariants » |

Répartition locale, qui recoupe le total : 50 (`domain`) + 23 (`database`) + 8
(`schema-drift`) + 29 (`tracking`) + 5 (`core`) + 14 (`proof-storage`, nouveau) =
129 cas. Le seul cas ignoré localement est l'entrelacement de deux connexions
simultanées : PGlite est mono-connexion ; il **s'exécute réellement en CI** sur
`postgres:16`.

### 5.4 Contrôle HTTP hors ligne — `npm run api:smoke`

Exécuté contre l'API réellement démarrée, **sans base de données**, il couvre ce
qui ne dépend pas de la base et complète la suite de bout en bout : vivacité,
disponibilité dégradée (`503`), refus sans jeton, jeton expiré / daté dans le
futur / signé avec un autre secret / à charge utile altérée, validation des
entrées, propriété non déclarée, corps illisible corrélé, charge hors limite
(`413`), origine autorisée / refusée, préflight, en-têtes de durcissement,
identifiant de corrélation conservé, route inconnue (`404`), routes de preuves
protégées, absence de secret dans les réponses, limitation de débit (5 connexions
puis `429`), et la **confiance au proxy dans les deux sens** :

- sans proxy déclaré, six adresses annoncées différentes ne contournent pas la
  limite (le sixième essai est refusé) ;
- avec `TRUST_PROXY_HOPS=1`, la même adresse réelle est limitée et une autre
  adresse reste autorisée — sans quoi tous les clients d'un répartiteur
  partageraient un quota.

### 5.5 Ce qui n'a pas pu être exécuté ici, et pourquoi

| Élément | Raison locale | État vérifié |
| --- | --- | --- |
| PostgreSQL réel | absent de l'environnement, sans Docker | ✅ **exécuté en CI** (suites HTTP, réalité, sauvegarde) |
| `prisma validate` / `generate` / `migrate deploy` | hôte des binaires Prisma hors périmètre réseau | ✅ **exécuté en CI — succès** |
| `pg_dump` / `pg_restore` | outils absents localement | ✅ **exécuté en CI — succès** |
| `next build` sans accès aux polices Google | hôte des polices hors périmètre | ✅ **exécuté en CI — succès** |
| Staging | **non provisionné** (§ 7.1) | ❌ **non exécuté** |

Règle tenue : une vérification non exécutée est écrite comme non exécutée. Aucun
résultat n'est extrapolé d'une exécution partielle.

---

## 6. Sécurité et exploitation — état vérifié

Détail complet dans `docs/SECURITY-MODEL.md`. Points adossés à un test :

- **Authentification** : jeton signé `v1.<charge>.<émission>.<HMAC>`, durée 8 h ;
  le jeton est confronté à la base à chaque requête (compte actif, `tokenVersion`,
  rôle re-résolu) — un rôle retiré invalide immédiatement les jetons en
  circulation. Connexion : message unique, aucune énumération de comptes.
- **Cloisonnement** : filtrage par `companyId` dans la requête ; ressource d'une
  autre entreprise ⇒ `404`, jamais `403`.
- **Autorisations** : RBAC côté API ; un `DRIVER` n'agit que sur ses missions.
- **Validation** : `whitelist` + `forbidNonWhitelisted` + `forbidUnknownValues` ;
  propriété non déclarée rejetée (`400`).
- **Secrets** : `.env.example` ne liste plus que des variables réellement lues.
  `JWT_SECRET`, `JWT_REFRESH_SECRET`, `REDIS_URL` et `S3_*` en ont été retirées :
  elles n'étaient lues par aucun code et laissaient croire qu'un stockage objet ou
  une connexion Redis étaient configurés. L'API utilise `AUTH_SECRET`, `PORT`,
  `CORS_ORIGIN`, `TRUST_PROXY_HOPS`, `PROOF_STORAGE_DIR`.
- **Journalisation** : identifiant de corrélation sur chaque réponse, y compris
  pour une requête rejetée par l'analyseur de corps ; aucune donnée sensible
  (secret, jeton, contenu de preuve) dans les journaux ; erreurs `5xx` muettes
  côté client, cause complète côté serveur.
- **Limitation de débit** : 120/min général, 5/min connexion, 30/min caisse,
  20/min dépôt de preuve — et la décision `TRUST_PROXY_HOPS` est vérifiée dans
  les deux sens (§ 5.4).
- **Idempotence** : `Idempotency-Key` obligatoire sur les mutations financières ;
  clé rejouée à l'identique ⇒ résultat initial ; contenu différent ⇒ `409`.
- **Audit** : table unique, chaque mutation testée laisse exactement une trace.

**Absent et à ne pas annoncer comme disponible** : chiffrement au repos, rotation
de `AUTH_SECRET` outillée, WAF, notifications (aucun canal configuré), paiement
mobile money (**les encaissements sont des déclarations d'exploitation, pas des
mouvements d'argent réels**), stockage objet avec URL signée, supervision et
alerting.

---

## 7. Staging, migrations, sauvegarde

### 7.1 Staging : non provisionné — blocage externe nommé

Aucun environnement de staging n'existe, et cette absence n'est **pas** contournée
par une simulation. Il manque, nominativement :

1. une instance **PostgreSQL dédiée** (jamais la base de production) ;
2. un hébergement pour l'API capable de monter un **volume persistant** (sans quoi
   les preuves ne survivent pas à un redéploiement) ;
3. un **`AUTH_SECRET`** propre au staging (≥ 32 caractères) ;
4. la liste des **origines CORS** du staging et le **nombre réel de proxies**
   devant l'API ;
5. un **accès à l'espace de sauvegarde**, avec `pg_dump`/`pg_restore`/`psql`
   disponibles dans l'environnement d'exécution.

Le staging est **bloqué sur des ressources et autorisations externes**, pas sur du
code. Tout ce qui n'en dépend pas a été fait et est vérifié.

### 7.2 Restauration : réellement exécutée en CI

`tests/api-e2e/backup-restore.e2e.test.ts` — **2 cas réussis en CI**. La suite
exécute réellement `pg_dump --format=custom`, puis `pg_restore` dans une base
**isolée** au nom tiré au sort, et contrôle après restauration :

- les données (entreprise, mission, preuve, caisse, audit) ;
- l'empreinte et la taille de la ligne de preuve ;
- que les **contraintes sont toujours actives** : clés étrangères, unicité,
  `CHECK` (`expectedAmount >= 0`, cohérence remise/encaissement) — une
  restauration qui « réussit » sans ses contraintes produit une base
  silencieusement fausse ;
- que la base restaurée contient **exactement** les mêmes tables que la source
  (aucune table perdue), avec `proof_files` présente ;
- l'état des migrations lorsqu'il est suivi dans l'environnement.

En fin d'exécution, la base de restauration est supprimée
(`DROP DATABASE … WITH (FORCE)`), **inconditionnellement** — y compris si un
contrôle échoue, sinon un échec laisserait la base derrière lui. Si les outils
clients sont absents, la suite se **saute explicitement avec un avertissement** :
elle ne fait jamais croire à une vérification qui n'a pas eu lieu.

**Limite assumée :** ces deux cas ont été exécutés sur la base éphémère de CI.
Aucune restauration n'a été exécutée sur le futur environnement d'exploitation,
qui n'existe pas. Un test de restauration périodique sur l'infrastructure réelle
reste un prérequis (§ 11.2).

### 7.3 Ce que la sauvegarde doit couvrir

Les preuves vivent **hors** de la base. Sauvegarder PostgreSQL seul conserve les
empreintes et les références mais **pas les fichiers** : après restauration, chaque
téléchargement renverrait `410`. La sauvegarde doit donc couvrir la base **et** le
volume `PROOF_STORAGE_DIR` (procédure détaillée dans
`docs/DEPLOYMENT-ARCHITECTURE.md`, § 5). Aucune sauvegarde planifiée n'existe.

### 7.4 Migrations

Discipline **additive** : aucune migration destructive n'a été exécutée, aucune ne
doit l'être sans autorisation explicite et sauvegarde vérifiée. La dernière
migration (`proof_delivery_storage`) ne fait que créer une table. La rejouabilité
est vérifiée en CI (schéma recréé de zéro puis migrations appliquées dans
l'ordre), ainsi que l'absence de dérive schéma ⇄ migrations.

---

## 8. Écarts restants

| Écart | Impact pilote | État |
| --- | --- | --- |
| **Staging non provisionné** | bloque le pilote opérationnel | bloqué sur ressources externes (§ 7.1) |
| **Aucune sauvegarde planifiée** de production | perdable en cas d'incident | à configurer (§ 11.2) |
| **Rétention des preuves non arrêtée** | purge impossible ; conservation indéfinie | décision client requise |
| **Aucune supervision / alerte** | incident non détecté | sondes prêtes (`/health/live`, `/health/ready`) |
| **Aucun fournisseur de paiement** | encaissements = déclarations | non implémenté, non simulé |
| **Aucune notification** (SMS, WhatsApp, e-mail) | pas d'information automatique du client | non implémenté |
| **`Order` et `Mission` coexistent** | deux modèles pour un même concept | dette technique identifiée, non résolue |
| **Doublon de statut/documentation historique** | confusion possible | documentation recadrée |
| **Aucun linter configuré** | pas de contrôle de style statique | `typecheck` strict des deux projets fait office ; à décider |
| **Site non installable (PWA)** | usage terrain dépendant du navigateur | aucun `manifest`, aucun service worker |
| **Audit non exposé en lecture** | consultation en base uniquement | non implémenté |
| **Chiffrement au repos** | non vérifié | relève du volume/hébergeur |

**Mobile.** Aucune application native n'existe dans le dépôt (aucun
`mobile/`, `ios/`, `android/`, aucune configuration Expo). Conformément à la règle
posée, **aucune réécriture mobile disproportionnée n'a été engagée** : l'interface
web existante couvre fonctionnellement le pilote. À noter toutefois : le site
n'est **pas** installable hors ligne (pas de `manifest`, pas de service worker),
alors qu'une file d'attente hors ligne existe côté logique
(`lib/jotoliko-os/offline-queue.ts`). La décision « PWA installable ou application
native » appartient au client et conditionne l'usage terrain réel.

---

## 9. Risques résiduels

1. **Le code des preuves n'a jamais tourné ailleurs qu'en CI.** Il est vérifié
   (107 cas, fichiers contrôlés sur disque par empreinte), mais jamais avec des
   photos réelles prises sur un téléphone en réseau faible — tailles, formats,
   latences réelles.
2. **Le GPS n'a jamais été vérifié avec un vrai signal.** La logique de fraîcheur
   est testée ; la qualité de la localisation en zone dense ne l'est pas.
3. **Un seul serveur, un seul volume.** Le stockage des preuves sur répertoire
   serveur exclut, en l'état, une architecture multi-instances sans volume
   partagé.
4. **Aucune mesure de performance.** Aucun test de charge : le débit réel sous
   plusieurs dizaines de livreurs simultanés est inconnu.
5. **La concurrence de la caisse est vérifiée par tests, pas par un usage réel.**
6. **Risque d'exploitation** : sans sauvegarde planifiée ni supervision, la
   détection et la récupération reposent entièrement sur l'humain.
7. **La dérive `Order`/`Mission` reste ouverte** : toute évolution devra choisir
   explicitement le modèle de référence.
8. **Un défaut de ce type peut se reproduire** : le défaut de la clé de stockage
   (§ 4.1) était invisible en test unitaire et en compilation. La parade — un test
   qui compose la valeur réelle avant de la valider — a été ajoutée pour ce
   module, mais n'est pas systématique.

---

## 10. Ce que ce rapport ne prétend pas

- Que Jotoliko est prêt pour la production : **non**.
- Que la CI verte démontre un fonctionnement opérationnel : la CI démontre ce
  qu'elle teste. Elle ne dit rien de la charge, du réseau réel, de la formation
  des utilisateurs ni de l'exploitation.
- Qu'un environnement de staging ou de production existe : **aucun n'existe**.
- Qu'un paiement mobile money fonctionne : **aucun fournisseur n'est configuré ni
  testé**.
- Que les preuves sont sauvegardées : la procédure est écrite, exécutée en CI sur
  une base éphémère, **et aucune sauvegarde planifiée n'existe**.
- Qu'un déploiement a eu lieu : **aucun**.

---

## 11. Prérequis

### 11.1 Conditions du pilote **technique**

1. Périmètre restreint et assumé : une entreprise, une équipe, un volume de
   missions limité.
2. **Pas d'espèces réelles** engagées sur la base des chiffres enregistrés : les
   encaissements sont des déclarations d'exploitation, aucun fournisseur de
   paiement n'est branché.
3. **Preuves conservées** sur un volume persistant (`PROOF_STORAGE_DIR`), avec une
   sauvegarde manuelle des deux éléments (base **et** volume) avant chaque étape
   importante.
4. Une personne désignée pour lire les journaux par identifiant de corrélation en
   cas d'incident, et un canal de retour des incidents.
5. Décision explicite sur la durée de conservation des preuves avant toute
   suppression.
6. Rappel aux utilisateurs : l'application web n'est pas installable hors ligne
   en l'état ; l'usage terrain doit être validé sur les appareils visés.

### 11.2 Conditions du pilote **opérationnel contrôlé**

En plus de 11.1 :

1. **Staging provisionné et validé** (§ 7.1) — les cinq éléments nommés.
2. **Sauvegarde planifiée** de la base **et** du volume de preuves, avec
   vérification d'intégrité, conservée hors du serveur de production.
3. **Restauration testée sur l'infrastructure réelle**, chronométrée
   (RTO/RPO mesurés, aujourd'hui non mesurés).
4. **Retour arrière documenté et éprouvé** : migrations additives uniquement,
   procédure de retour arrière connue de l'exploitant.
5. **Supervision branchée** : `GET /health/ready` doit retirer l'instance du
   routage ; alerte sur `5xx` et sur indisponibilité de la base.
6. **Politique de rétention des preuves arrêtée avec le client**, et procédure de
   purge écrite.
7. **Formation des utilisateurs** et procédure de support.
8. Décision explicite du client sur l'usage hors ligne (PWA installable ou
   application native).

### 11.3 Interdits maintenus

- **Aucun déploiement de production sans autorisation explicite.**
- **Aucune migration destructive** sur des données existantes sans autorisation
  explicite **et** sauvegarde vérifiée.
- Aucun test désactivé pour obtenir une CI verte.
- Aucun merge automatique : PR #4 attend une décision humaine.

---

## Annexe — Reproduire ces vérifications

```bash
# 1. Socle local (sans base de données)
npm ci
node apps/api/scripts/local-prisma-stub.mjs   # substitut local, jamais utilisé en CI
npm run typecheck          # 0 erreur
npm test                   # 128 réussis, 1 ignoré (129) — 6 fichiers
npm run api:typecheck      # 0 erreur
npm run api:build          # dist/apps/api/src/main.js
npm run api:smoke          # 24/24 contrôles HTTP, sans base

# 2. Bout en bout (exige PostgreSQL 16 réel)
export DATABASE_URL="postgresql://user:pass@localhost:5432/jotoliko_e2e"
npm run api:build && npm run test:e2e:api   # 107 cas

# 3. Sauvegarde / restauration (exige pg_dump, pg_restore, psql)
npx vitest run --config vitest.e2e.config.ts tests/api-e2e/backup-restore.e2e.test.ts

# 4. CI
gh pr checks 4
gh api "/repos/aydiarra-star/Jotoliko/check-runs/<id>/annotations"   # dont E2E-BILAN
```

Vérifications CI de référence (2026-10-15) :
[API](https://github.com/aydiarra-star/Jotoliko/actions/runs/38714436073/job/116353553340) ·
[e2e](https://github.com/aydiarra-star/Jotoliko/actions/runs/38714436073/job/116353553109) ·
[Reality](https://github.com/aydiarra-star/Jotoliko/actions/runs/38714436182/job/116353553427) ·
[Site](https://github.com/aydiarra-star/Jotoliko/actions/runs/38714436182/job/116353553922)
