# JOTOLIKO — RELEASE READINESS REPORT

**Date** : 2026-10-15
**Branche** : `arena/dd76021f-jotoliko` (depuis `main` = `3b0f3b7`)
**Périmètre** : audit, réconciliation, correction, tests réels, préparation opérationnelle
**PR produite** : [#4](https://github.com/aydiarra-star/Jotoliko/pull/4) — **5/5 vérifications vertes**
**PR préservée** : [#3](https://github.com/aydiarra-star/Jotoliko/pull/3) — intacte, ouverte
**Ampleur** : 87 commits, 107 fichiers, **+21 463 / −408** lignes depuis `main` (ce rapport inclus, mesuré avant de l'écrire)

> **Principe de rédaction.** Chaque affirmation de ce rapport renvoie à une
> commande exécutée ou à une vérification CI consultable. Ce qui n'a pas été
> exécuté est écrit comme non exécuté. **Aucune affirmation de production.**
> Les mesures publiées sont accompagnées de leur portée : une restauration
> chronométrée sur une base de test n'est pas un RTO de production.

---

## 1. Décision

### **NOT READY — production**

Non déployable en production. Les raisons ne sont pas des réserves de forme :

- aucun environnement d'exploitation n'existe (ni staging, ni production) ;
- aucune sauvegarde planifiée de production n'existe, donc aucun RPO réel ;
- aucune alerte n'est branchée sur un canal joignable, et aucun destinataire
  n'est désigné ;
- la politique de rétention des pièces justificatives n'est pas arrêtée par le
  client (§ 8) ;
- les seuls RTO mesurés le sont sur une base de test (§ 7.5) ;
- aucun encaissement n'est confirmé par un fournisseur de paiement : tout est
  déclaratif (§ 9.2) ;
- douze avis de dépendances subsistent, dont trois côté API (tous dans l'outillage
  Prisma), dont le correctif proposé est une montée majeure non appliquée sans
  autorisation (§ 5.6).

### **READY FOR TECHNICAL PILOT — sous conditions**

Le socle technique est **démontré par l'exécution**, pas par la compilation :

- **115 tests HTTP de bout en bout** sur un **PostgreSQL 16 réel**, avec le
  serveur tel qu'il est livré (`node apps/api/dist/apps/api/src/main.js`), les
  vrais gardes, la vraie validation et le vrai client Prisma — **115 réussis,
  0 échec, 0 ignoré** (annotation `E2E-BILAN`, § 5.1) ;
- **171 tests unitaires** locaux (plus 1 ignoré, faute de base locale) ;
- **26 contrôles HTTP hors ligne** et, en CI, la **chaîne de sauvegarde et de
  restauration réellement exécutée et chronométrée** (§ 7.2) ;
- le **stockage des preuves de livraison** écrit de vrais fichiers, avec
  empreinte vérifiée après restauration.

Un pilote **technique** — équipe restreinte, périmètre limité, objectif de
validation terrain, tolérance aux incidents — est soutenable **aux conditions du
§ 13.1**.

### **NOT READY — pilote opérationnel contrôlé**

Un pilote opérationnel (livraisons réelles, espèces réelles, preuves faisant foi)
exige en plus : un staging provisionné et validé, une sauvegarde **base + volume**
planifiée **et** restaurée sur cet environnement, une politique de rétention
arrêtée, des alertes aboutissant à un responsable, et une décision explicite sur
l'usage hors ligne. **Aucun de ces éléments n'existe**, et chacun dépend d'une
ressource ou d'une décision externe (§ 10, § 11, § 13.2).

| Niveau | Décision | Ce qui la fonde |
| --- | --- | --- |
| Production | **NOT READY** | Aucun environnement, sauvegarde planifiée, alerte, rétention arrêtée ni RTO réel |
| Pilote technique | **READY sous conditions** | 115 cas HTTP réels sur PostgreSQL 16, restauration mesurée, preuves réellement stockées |
| Pilote opérationnel contrôlé | **NOT READY** | Staging, sauvegarde planifiée + alerte, rétention et décision hors ligne non acquis |

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

`30fb88c`, `48dfa56`, `a588630`, `7a612f1`, `bf13afd` — typecheck lisible
(erreurs publiées en annotations), suites base séquentielles, type de transaction
officiel, échecs e2e publiés en annotations **et** en artefact, **bilan des tests
exécutés publié en annotation même en cas de succès**, et repère d'échec fondé sur
le **code de sortie** de la suite (une suite verte ne doit jamais porter
d'annotation de niveau erreur — défaut réellement observé, puis corrigé).

### 3.3 Suite HTTP de bout en bout et GPS

`fc04dbe` — création de la suite HTTP (auth, missions, caisse, GPS, isolation,
sécurité, limitation de débit) contre l'API réellement démarrée ; **correction du
GPS** : la vue recalcule la fraîcheur à chaque lecture et n'expose les coordonnées
que tant qu'elles sont exploitables ; violations de périmètre converties en `403`.

### 3.4 Stockage réel des preuves

`9488140` — table `proof_files` + migration additive ; module
`apps/api/src/proofs/**` ; validation par **signature binaire** ; écriture atomique
`0600` ; clé déterministe `<entreprise>/<mission>/<empreinte>.<ext>` ; routes
`POST/GET/DELETE /missions/:id/proofs[/:proofId]` ; flux de téléchargement non mis
en cache ; `410` si le fichier manque (ligne conservée) ; suppression logique
auditée ; **pagination réparée** (curseur de 84 caractères pour un DTO qui le
bornait à 64 : toute deuxième page renvoyait `400`).

### 3.5 Phase finale de préparation opérationnelle

| Commit | Objet |
| --- | --- |
| `3e31499` | Démarrage réel de l'API vérifié : `ProofsModule` ne fournissait pas les dépendances de la garde ; substitut Prisma local rendu exécutable ; identifiant de corrélation posé avant l'analyse du corps ; premier contrôle HTTP hors ligne |
| `53b5d79` | Contrôle hors ligne étendu : `X-Forwarded-For` ignoré sans proxy déclaré (pas de contournement de la limitation) et honoré derrière un proxy déclaré ; exécution en CI |
| `4fb3518` | **Correction de la cause racine du dépôt de preuves** (§ 4.1) ; démarrage résilient à une base indisponible ; diagnostics 5xx |
| `1b9e5ce` | Contrat d'API, modèle de sécurité et architecture de déploiement réécrits sur l'état réel ; `.env.example` réduit aux variables réellement lues |
| `7a612f1` | Bilan des tests publié en annotation, succès compris |
| `bf13afd` | Repère d'échec fondé sur le code de sortie de la suite |
| `a7f49dd` | **Supervision du volume de preuves** (`/health/ready` vérifie base **et** stockage), seuil configurable, socle d'exploitation `ops/`, scripts de sauvegarde, restauration, purge et sonde ; test système des scripts ; exercice d'exploitation quotidien en CI ; runbook, politique de rétention, hypothèses RPO/RTO |
| `96a43ca` | Défauts révélés par la première exécution réelle des scripts (§ 4.4) ; contrôle statique `checkJs` des scripts d'exploitation |
| `a335edb` | Deux attentes fausses de la suite système corrigées, non contournées |
| `382fd23` | Mesures de restauration publiées depuis un fichier, et non depuis le journal — la restitution affichait sinon « aucune mesure » alors que la restauration avait été mesurée |
| `8b43028` | Un job vert ne porte plus d'annotation d'échec : l'audit des dépendances publie son constat au bon niveau (§ 5.6) |
| `1440a20` | **L'exercice d'exploitation ne purgeait rien** (§ 4.6) : trois preuves d'âges différents, et vérification d'effets observables plutôt que d'une sortie de script |
| `f76e90c` | **Défaut contredisant sa propre règle** (§ 4.5) : délai de la sonde porté de 5 s à 12 s pour dépasser le budget interne de l'API, vivacité retenue comme discriminant entre « dégradé » et « injoignable », et test système éprouvant le comportement **par défaut** au lieu d'un délai ajusté |

---

## 4. Défauts corrigés

### 4.1 Le dépôt de preuve échouait en `500` pour **tout** fichier

**Symptôme.** En CI, `POST /missions/:id/proofs` renvoyait `500` ; les contrôles
suivants (liste, téléchargement, non-duplication) échouaient en cascade.

**Cause racine, démontrée.** La validation d'un segment de clé de stockage le
bornait à 64 caractères, alors que la clé composée par `keyFor`
(`<empreinte SHA-256>.<extension>`) en fait **68** (jpg/png/pdf) ou **69** (webp).
Le contrôle refusait donc toute écriture, avec un `500` muet (« Clé de stockage
invalide »). Le schéma, la migration, la table et les tests de schéma étaient
corrects : c'est l'accord entre la composition de la clé et sa validation qui
manquait.

**Portée.** Cette fonctionnalité — le stockage réel des preuves, exigence centrale
de la mission — était **entièrement inopérante** tout en donnant une CI verte sur
tout le reste. Illustration exacte de la règle « la compilation n'est pas la
preuve du fonctionnement ».

**Correction.** La borne est **déduite** de ce que `keyFor` produit réellement
(`MAX_STORAGE_SEGMENT_LENGTH = 69`, constante exportée et justifiée), et le message
nomme le segment refusé. `tests/unit/proof-storage.test.ts` (aujourd'hui **19
cas**, sans base de données) compose la clé **réelle** avant de la valider, vérifie
l'aller-retour disque avec empreinte recalculée, les permissions `0600`, l'absence
de fichier temporaire, l'idempotence du chemin, le refus de sortir du répertoire,
et — ajoutés dans cette phase — le comportement en volume non inscriptible, en
chemin non-répertoire et en espace insuffisant.

### 4.2 L'API ne pouvait pas se déclarer « non prête »

`PrismaService.onModuleInit` laissait un échec de connexion faire sortir le
processus. Conséquences réelles : la branche dégradée **documentée et implémentée**
de `/health/ready` (`503`, `checks.database = "unreachable"`) était
**inatteignable** ; une coupure passagère de la base faisait repartir le service en
boucle de redémarrage ; et le contrôle hors ligne échouait en CI (il passe avec un
substitut qui ne se connecte jamais réellement — le contrôle était donc trompeur au
moment précis où il comptait).

La disponibilité de la base n'est plus une condition de démarrage : tentative
bornée à 10 s, erreur journalisée, `/health/ready` renvoie `503`. **La
configuration, elle, reste bloquante** (secret absent ou trop court, `CORS_ORIGIN`
implicite, `PORT` invalide, répertoire de preuves inutilisable ⇒ pas de démarrage).

### 4.3 Défauts corrigés lors des phases précédentes

- **Pages 2+ de la liste des missions impossibles** : curseur de 84 caractères pour
  une borne `@MaxLength(64)` ⇒ `400` systématique.
- **GPS jamais renvoyé** : `gps.at`, `latitude`, `longitude` valaient `null` en
  permanence malgré des colonnes lues ; une position périmée pouvait être
  présentée comme actuelle.
- **Violations de périmètre en `500`** : un livreur agissant hors de ses missions
  produisait une erreur interne au lieu d'un refus `403`.
- **API impossible à démarrer dès que les routes de preuves existaient** :
  `ProofsModule` déclarait son contrôleur sans fournir les dépendances de la garde.
- **Substitut Prisma local générant du JavaScript invalide** : aucun contrôle local
  n'était possible hors ligne.
- **Annotations d'échec sur un job vert** : le repli « journal → annotations »
  s'appliquait aussi en cas de succès (10 annotations d'erreur sur un job e2e vert).
  Le **code de sortie** est désormais la seule source de vérité.

### 4.4 Défauts corrigés révélés par la première exécution réelle des scripts

Ces trois défauts partagent une même propriété : **aucune vérification locale ne
pouvait les voir**. Ils ont été trouvés en exécutant réellement les scripts
d'exploitation sur PostgreSQL, en CI — ce qui justifie la suite système ajoutée.

1. **Toute sauvegarde échouait** (`delimiter is not defined`) : une fonction du
   socle utilisait `delimiter` sans que l'import soit présent. Le code passait la
   relecture et la vérification syntaxique ; il n'était jamais exécuté localement,
   faute de PostgreSQL et de client `pg_dump` dans l'environnement de développement.
2. **Rapport et messages mélangés** : la sortie standard portait à la fois les
   annotations et le rapport JSON, ce qui rendait `node ops/backup.mjs | jq`
   impossible et obligeait les tests à deviner où commence le JSON. La sortie
   standard porte désormais uniquement le rapport ; messages et annotations
   partent sur la sortie d'erreur (GitHub interprète les commandes sur les deux
   flux : les annotations restent publiées).
3. **Refus attendus publiés en erreur** : la purge invoquée volontairement sans
   date limite, un déchiffrement provoqué avec une clé erronée, une configuration
   incomplète ou une sonde face à un service absent produisaient des annotations
   `error` sur des jobs verts — la même erreur que celle corrigée au § 4.3. Un refus
   attendu par un test ne publie plus rien ; le workflow neutralise la publication
   pour l'invocation qu'il provoque lui-même.

**Contrôle ajouté pour que la classe de défaut n° 1 ne se reproduise pas** :
`ops/tsconfig.json` active `checkJs` sur `ops/` (`npm run ops:typecheck`, exécuté en
CI, erreurs publiées en annotations). Il a trouvé six erreurs de typage réelles au
premier passage, toutes corrigées. Les fonctions pures qui n'étaient pas testées le
sont désormais, à commencer par celle où vivait l'import manquant.

### 4.5 La sonde de supervision contredisait la règle écrite dans le runbook

**Symptôme.** Le runbook prescrit un délai d'attente **supérieur** au budget de
diagnostic interne de l'API (10 s). Le script utilisait 5 s par défaut.

**Conséquence réelle.** Sur une base seulement lente, `/health/ready` ne répond pas
dans les 5 s : la sonde concluait `INDISPONIBLE` (code 2, « intervenir ») au lieu de
`DEGRADE` (code 1, « alerter »). L'astreinte aurait été envoyée redémarrer une
instance dont le processus était vivant et le problème dans la base — le mauvais
geste, au pire moment. Le défaut était d'autant plus insidieux que la règle était
**écrite** : la documentation était juste, le comportement par défaut ne l'était pas.
Le test système, lui, contournait le problème en passant `--timeout=40000` : il
éprouvait une configuration que personne n'utilise.

**Correction.** Le défaut passe à **12 s** et la règle est citée dans le code, à
l'endroit où elle s'applique. La **vivacité** devient le discriminant : si
`/health/live` répond, le processus vit, donc l'état est `DEGRADE` — quelle que soit
la raison du silence de la disponibilité ; si même la vivacité est muette, l'état
reste `INDISPONIBLE`, où le redémarrage est le bon geste. Le test système n'ajuste
plus aucun délai : il éprouve exactement ce que l'astreinte exécutera.

### 4.6 L'exercice d'exploitation prouvait la purge sans rien purger

**Symptôme, lu dans les annotations du job vert.** `PURGE-EXECUTION :: 2030-01-01 —
rien à purger ; 1 preuve(s) active(s) non touchée(s)`.

**Cause.** L'exercice ne créait qu'**une** preuve, active. Or la purge ne touche que
les preuves **déjà supprimées logiquement** : elle n'avait donc rien à supprimer, et
la date limite fixée dans le futur (2030) masquait le problème. L'exercice
démontrait le refus de purger sans date — utile — mais rien de la suppression
elle-même.

**Pourquoi c'est un défaut et pas un détail.** C'est exactement le piège que ce
rapport combat : une vérification **verte** qui ne vérifie rien. Le jour où la purge
aurait cessé de fonctionner (chemin, permission, format de date), l'exercice
quotidien serait resté vert en affichant « rien à purger ».

**Correction.** L'exercice pose trois preuves — une active, une supprimée depuis
400 jours, une supprimée le jour même — calcule la date limite à l'exécution (200
jours avant), puis vérifie des **effets observables** : le fichier éligible a
disparu, les deux autres sont intacts, et les trois lignes de `proof_files` sont
conservées. Constate publié dans les annotations du job vert :

> `PURGE :: date limite 2026-03-29 — 1 fichier supprimé, 1 preuve récemment supprimée
> et 1 preuve active intactes, 3 ligne(s) de traçabilité conservée(s)`

---

## 5. Tests exécutés — quoi, où, résultat

### 5.1 Bout en bout, sur PostgreSQL 16 réel (CI)

Job « Tests HTTP de bout en bout (API + PostgreSQL 16) » —
[run 38722779519 / job 116381175915](https://github.com/aydiarra-star/Jotoliko/actions/runs/38722779519/job/116381175915)
— **pass**, 1 min 20.

Le serveur est démarré **tel qu'il est livré** et interrogé par de vraies requêtes
HTTP : chaîne garde d'authentification → garde de permissions → validation →
service → Prisma → SQL → contraintes. **Aucune imitation de base, de garde ou de
service.**

Bilan publié par la CI elle-même (annotation `E2E-BILAN`, vérifiable par API) :

> cas exécutés : **115** — réussis : **115** — échoués : **0** — ignorés : **0**

| Fichier | Cas | Couverture |
| --- | --- | --- |
| `auth.e2e.test.ts` | 16 | connexion, jeton absent/expiré/futur/mal signé/altéré, révocation, compte inactif |
| `missions.e2e.test.ts` | 22 | création, affectation, transitions autorisées **et refusées**, preuve exigée avant clôture, pagination par curseur |
| `cash.e2e.test.ts` | 15 | encaissement, remise, concurrence, idempotence, non-duplication |
| `gps.e2e.test.ts` | 13 | coordonnées valides, hors bornes, données absentes, position périmée |
| `proofs.e2e.test.ts` | 15 | dépôt, **fichier réellement sur le disque (empreinte recalculée)**, absence de contenu dans les métadonnées, en-têtes de téléchargement, `415`/`413`/`400`, non-duplication, `410`, suppression logique, périmètre |
| `security.e2e.test.ts` | 12 | CORS, en-têtes, validation stricte, non-divulgation, **et désormais la sonde de disponibilité du volume de preuves** |
| `isolation.e2e.test.ts` | 10 | cloisonnement entre entreprises (`404`, jamais `403`) |
| `backup-restore.e2e.test.ts` | 2 | sauvegarde et restauration réellement exécutées (§ 7.2) |
| `rate-limit.e2e.test.ts` | 2 | quota respecté, en-tête `X-Forwarded-For` |
| `ops-scripts.e2e.test.ts` | 8 | **exécution réelle des quatre scripts d'exploitation** : sauvegarde base + volume, restauration chronométrée avec vérification des empreintes, chiffrement et refus d'une clé erronée, purge (refus sans date limite, simulation, exécution), sonde disponible / dégradée / injoignable |

### 5.2 Les cinq vérifications de la PR #4 (toutes vertes)

| Vérification | Résultat | Durée | Lien |
| --- | --- | --- | --- |
| API (Prisma, migrations, build) | ✅ pass | 1 min 21 | [job 116381176217](https://github.com/aydiarra-star/Jotoliko/actions/runs/38722779519/job/116381176217) |
| Tests HTTP de bout en bout (API + PostgreSQL 16) | ✅ pass | 1 min 20 | [job 116381175915](https://github.com/aydiarra-star/Jotoliko/actions/runs/38722779519/job/116381175915) |
| Sauvegarde, restauration mesurée et purge (base de test) | ✅ pass | 51 s | [job 116381174860](https://github.com/aydiarra-star/Jotoliko/actions/runs/38722779274/job/116381174860) |
| Reality tests sur PostgreSQL 16 réel | ✅ pass | 40 s | [job 116381175522](https://github.com/aydiarra-star/Jotoliko/actions/runs/38722779360/job/116381175522) |
| Site + invariants + PostgreSQL embarqué | ✅ pass | 1 min 2 | [job 116381175306](https://github.com/aydiarra-star/Jotoliko/actions/runs/38722779360/job/116381175306) |

Ces cinq vérifications portent **toutes** le niveau `success`, et les cinq jobs
comptent **zéro annotation de niveau `failure`** — vérifié en interrogeant
`/check-runs/<job>/annotations` pour chacun des cinq, et non en se fiant à la couleur
du job. Une annotation d'échec résiduelle subsistait auparavant sur le job API
(§ 5.6) ; elle a disparu. Les seules annotations `warning` restantes sont les
rappels d'outillage (dépréciation de Node 20 par des actions tierces) et le constat
d'audit des dépendances, publié au niveau qui lui revient (§ 5.6). Les constats
d'exploitation sont publiés en `notice` : durée de restauration, risque « base
seule », état des sauvegardes, portée de l'exercice.

Le job API exécute en plus, sur une base migrée par `prisma migrate deploy` :
validation du schéma, génération du client, **détection de dérive schéma ⇄
migrations**, typecheck TypeScript, **typecheck `checkJs` des scripts
d'exploitation**, build, vérification du point d'entrée démarré et **contrôle HTTP
hors ligne** (§ 5.4).

**Aucun test n'est ignoré en CI** : le bilan indique `ignorés : 0`.

### 5.3 Vérifications locales (cet environnement, dernier état)

| Commande | Résultat observé |
| --- | --- |
| `npm test` | **7 fichiers — 171 réussis, 1 ignoré, 0 échec** (172 cas) |
| `npm run typecheck` | **0 erreur** |
| `npm run api:typecheck` | **0 erreur** |
| `npm run ops:typecheck` | **0 erreur** (`checkJs` sur `ops/`) |
| `npm run api:build` | succès (`dist/apps/api/src/main.js`) |
| `npm run api:smoke` | **26 / 26 contrôles réussis** |
| `node ops/backup.mjs --dry-run` | simulation, aucune écriture, configuration refusée si incomplète |
| `npm run build` (site) | non exécutable ici (polices Google hors périmètre réseau) → **exécuté en CI — succès** |

Le seul cas ignoré localement est l'entrelacement de deux connexions simultanées :
PGlite est mono-connexion ; il **s'exécute réellement en CI** sur `postgres:16`.

### 5.4 Contrôle HTTP hors ligne — `npm run api:smoke` (26 contrôles)

Exécuté contre l'API réellement démarrée, **sans base de données exploitable**, il
couvre ce qui ne dépend pas de la base : vivacité ; disponibilité cohérente avec
l'état réel de la base (`503` et `checks.database = "unreachable"` quand elle est
absente) ; **sonde du volume de preuves** (espace libre publié, volume rendu non
inscriptible ⇒ `503` et `checks.storage ≠ ok`) ; refus sans jeton ; jeton expiré /
daté dans le futur / signé avec un autre secret / à charge utile altérée ;
validation des entrées ; propriété non déclarée ; corps illisible corrélé ; charge
hors limite (`413`) ; origine autorisée / refusée ; préflight ; en-têtes de
durcissement ; identifiant de corrélation conservé ; route inconnue (`404`) ;
routes de preuves protégées ; absence de secret dans les réponses ; limitation de
débit (5 connexions puis `429`) ; et la **confiance au proxy dans les deux sens** :

- sans proxy déclaré, six adresses annoncées différentes ne contournent pas la
  limite (le sixième essai est refusé) ;
- avec `TRUST_PROXY_HOPS=1`, la même adresse réelle est limitée et une autre
  adresse reste autorisée — sans quoi tous les clients d'un répartiteur
  partageraient un quota.

Deux corrections ont renforcé ce contrôle dans cette phase : il est **déterministe**
(le contrôle de quota utilise désormais une instance dédiée, au lieu de dépendre de
la durée totale du script et de la fenêtre de 60 s du limiteur), et il est
**auto-diagnostique** : chaque échec est publié en annotation
(`::error title=CONTRÔLE-HORS-LIGNE::`), donc lisible sans télécharger les journaux
du runner. Il couvre aussi les **deux états du volume de preuves**, disponible puis
rendu non inscriptible.

### 5.5 Ce qui n'a pas pu être exécuté ici, et pourquoi

| Élément | Raison locale | État vérifié |
| --- | --- | --- |
| PostgreSQL réel | absent de l'environnement, sans Docker ni binaires serveur | ✅ **exécuté en CI** (suites HTTP, réalité, sauvegarde/restauration, exercice d'exploitation) |
| `prisma validate` / `generate` / `migrate deploy` | hôte des binaires Prisma hors périmètre réseau | ✅ **exécuté en CI — succès** |
| `pg_dump` / `pg_restore` / `psql` | absents localement | ✅ **exécutés en CI** — sauvegarde, restauration et exercice quotidien |
| Sauvegarde et restauration **opérationnelles** | aucun environnement d'exploitation | ❌ **non exécutées** : la chaîne fonctionne sur une base de test, pas sur une infrastructure (§ 7.2) |
| `next build` | polices Google hors périmètre réseau | ✅ **exécuté en CI — succès** |
| Provisionnement d'un hébergeur | aucune dépense autorisée | ❌ **non fait** — inventaire et prix de liste datés au § 10 ; **aucun compte créé, aucun devis demandé** |

### 5.6 Audit des dépendances — informatif, non bloquant

L'audit des dépendances est volontairement **non bloquant** (une remédiation peut
exiger une montée de version majeure). Résultat mesuré aujourd'hui :

| Périmètre | Total | Gravités | Détail |
| --- | --- | --- | --- |
| API (`apps/api`) | 3 | 3 élevées, 0 critique | la dépendance **directe** est `prisma` (CLI, développement), qui entraîne `@prisma/config` → `deepmerge-ts`. **`@prisma/client`, qui est la surface d'exécution, n'est pas visé.** |
| Racine (site + outillage) | 12 | 9 élevées, 3 modérées, 0 critique | dont `next` (modéré, **direct**), `tailwindcss` et `prisma` (élevés, directs), et des dépendances transitives d'outillage de construction (`braces`, `chokidar`, `fast-glob`, `micromatch`, `postcss`) |

Le correctif proposé par l'outil pour les avis Prisma est une **montée de version
majeure** ; elle n'est pas appliquée : elle touche la chaîne de migrations, exige
une validation des migrations et une vérification de restauration, et n'entre pas
dans une préparation de pilote sans autorisation explicite. À noter : la version
proposée par l'annuaire est **antérieure** à la version installée, ce qui rend la
remédiation automatique inapplicable en l'état.

**Défaut corrigé :** cette vérification produisait la **seule annotation de niveau
`failure`** du job API (« Process completed with exit code 1 ») alors que toutes les
étapes étaient rapportées `success`. Cause : `npm audit` sort en erreur dès qu'il
trouve un avis, et `continue-on-error: true` marque bien l'étape en succès mais
laisse GitHub publier l'annotation d'échec. Un job vert porteur d'une annotation
d'échec apprend à ignorer les annotations —le contraire de l'effet recherché. Le
code de sortie est désormais capturé et le constat publié au **bon niveau** :
`warning` avec le décompte par gravité, `notice` pour les dépendances directes à
arbitrer. Le script distingue trois situations qui n'ont rien à voir : aucun avis,
des avis présents, et **audit impossible** (registre injoignable) — le troisième cas
n'est jamais présenté comme « aucune vulnérabilité ». Le même rapport est produit
pour l'API et pour la racine.

---

## 6. Sécurité et exploitation — état vérifié

| Domaine | État | Preuve |
| --- | --- | --- |
| Authentification | jeton signé (`AUTH_SECRET` ≥ 32 caractères, valeurs d'exemple refusées en production), expiration, date future refusée, révocation par `tokenVersion` | 16 cas e2e + 6 contrôles hors ligne |
| Cloisonnement inter-entreprises | `404` plutôt que `403` (aucune fuite d'existence), testé sur missions, preuves, caisse | 10 cas e2e |
| Autorisations par rôle | matrice appliquée par gardes, refus `403` testés | 22 cas missions |
| Validation des entrées | `whitelist` + `forbidNonWhitelisted` + `forbidUnknownValues` | 12 cas e2e + contrôles hors ligne |
| En-têtes et CORS | origines explicites, aucun repli permissif, en-têtes de durcissement | 12 cas e2e |
| Limitation de débit | 120 requêtes / 60 s global, 5 / 60 s sur la connexion ; `X-Forwarded-For` cru seulement si un proxy est déclaré | 2 cas e2e + 2 contrôles hors ligne |
| Idempotence | `Idempotency-Key` sur les mutations, `clientId` sur les preuves | 15 cas caisse + 15 cas preuves |
| Journal d'audit | écrit pour chaque mutation, avec identifiant de corrélation | vérifié en base par les tests |
| Secrets | jamais journalisés (`describeConfig` ne publie que la **longueur** du secret) ; **jamais en argument de commande** : mot de passe PostgreSQL par `PGPASSWORD`, phrase de chiffrement par `-pass file:` | test unitaire dédié « aucun secret dans la ligne de commande » |
| Preuves de livraison | écriture atomique `0600`, empreinte SHA-256, validation par signature binaire, chemin confiné au volume, `410` si le fichier manque | 19 tests unitaires + 15 cas e2e |
| Sonde de disponibilité | vérifie **base et volume de preuves** ; `503` si l'un des deux défaille ; espace libre publié | 26 contrôles hors ligne + assertion e2e + test système |
| Sonde d'alerting | `ops/healthcheck.mjs` : code de sortie **0** disponible / **1** dégradé / **2** injoignable | tests unitaires + test système (3 états éprouvés) |
| Sauvegardes | `pg_dump` + archive du volume, chiffrement optionnel, manifeste à double empreinte, relecture après écriture, rétention qui ne supprime jamais la plus récente | test système + exercice CI quotidien |
| Journaux exploitables | corrélation par `X-Request-Id`, erreurs 5xx muettes côté client et corrélées côté serveur | contrôles hors ligne et e2e |
| Ce qui manque | chiffrement au repos (relève du disque du fournisseur), rotation de `AUTH_SECRET`, WAF, purge automatique, fournisseur de paiement, notifications | `docs/SECURITY-MODEL.md` § 11 |

---

## 7. Staging, migrations, sauvegarde, restauration

### 7.1 Staging : non provisionné — blocage externe nommé

Aucun environnement d'exploitation n'existe. L'inventaire des éléments requis, la
spécification de configuration, la liste des secrets à générer (**sans jamais les
afficher ni les versionner**) et la procédure de vérification des coûts auprès des
fournisseurs sont dans `docs/DEPLOYMENT-ARCHITECTURE.md` § 2 et § 3.

Ce qui manque exactement, sans généralité :

1. une décision d'hébergeur : prix de liste relevés et datés (§ 10), **devis à
   demander** avant l'engagement, puis autorisation de dépense ;
2. un nom de domaine et un certificat pour l'API et le site ;
3. un secret d'authentification d'exploitation (généré sur place, jamais transmis
   par ce dépôt) et une liste d'origines CORS réelles ;
4. un volume persistant pour `PROOF_STORAGE_DIR` et un support **distinct** pour
   `BACKUP_DIR` ;
5. une base PostgreSQL managée ou un service équivalent, avec l'utilisateur dédié
   de moindre privilège et ses sauvegardes propres.

**Aucune dépense n'a été engagée.** Aucun service payant n'a été provisionné.

### 7.2 Restauration : réellement exécutée, et chronométrée

Deux niveaux, volontairement distingués :

**(a) Sauvegarde et restauration de base par les outils PostgreSQL** —
`backup-restore.e2e.test.ts` exécute `pg_dump` puis `pg_restore` dans une base
isolée (`jotoliko_verif_<aléatoire>`, supprimée avec `DROP DATABASE … WITH (FORCE)`
même en cas d'échec) et vérifie les données, les contraintes, les relations, la
ligne de preuve, la caisse et le journal d'audit.

**(b) Chaîne opérationnelle** — les scripts qui seront réellement planifiés sont
exécutés de bout en bout, sur une base de test, par l'exercice
`Jotoliko — exercice d'exploitation` ([job 116381174860](https://github.com/aydiarra-star/Jotoliko/actions/runs/38722779274/job/116381174860)) :
sauvegarde de la base **et** du volume de preuves, deux exécutions successives
(pointeur `latest` et rétention), restauration dans une base isolée, purge des
preuves avec refus sans date limite.

Mesures publiées par cet exercice (annotations `RTO-MESURÉ` et `PORTÉE-DE-LA-MESURE`) :

| Mesure | Valeur observée |
| --- | --- |
| Sauvegarde complète (base + volume, ~0,1 Mio) | 97–165 ms selon l'exécution, relue et vérifiée par empreinte |
| Restauration « base + volume » — exercice d'exploitation | **162 ms** (base 158 ms, extraction du volume 4 ms) |
| Restauration « base + volume » — test système | **407 ms** (base 404 ms, extraction du volume 3 ms) |
| Restauration « base seule » | 169–1 669 ms selon l'exécution |
| Preuves à empreinte conforme après restauration | 1 / 1 |
| Preuves référencées sans fichier si le volume n'est pas restauré | 1 (téléchargement impossible : `410`) |
| Problèmes détectés | 0 |

**Ces durées varient fortement d'une exécution à l'autre** : sur quatre exécutions
de la même restauration « base + volume », les valeurs relevées sont 2 972 ms,
226 ms, 255 ms, 162 ms et 407 ms — soit un facteur 18. Les lignes « base seule »
montrent la même dispersion (169 ms à 1 669 ms). La cause est le coût fixe de
`CREATE DATABASE` et du démarrage de `pg_restore`, dominé par la charge de
l'exécuteur, sur une base de quelques mégaoctets. C'est précisément pourquoi ces
chiffres ne peuvent pas servir d'engagement : ils mesurent l'outillage et la
machine, pas l'infrastructure. Deux conclusions seulement sont solides : **la chaîne
fonctionne, et elle est mesurable** ; la durée, elle, doit être re-mesurée sur
l'environnement réel avant toute annonce.

**Ce que la sauvegarde couvre, et pourquoi les deux éléments sont obligatoires.**
Les preuves vivent hors de la base : la base ne contient que l'empreinte et la clé
de stockage. Une sauvegarde de la base seule « réussit » et laisse les pièces
justificatives sans protection — c'est le chiffre ci-dessus (1 preuve sans fichier,
`410`), mesuré et non supposé.

### 7.3 Migrations

- Toutes les migrations sont **additives** ; les `DEFAULT uuid()` en base ont été
  supprimés (source de la dérive d'origine).
- `prisma migrate deploy` est exécuté en CI sur base vierge, et une **détection de
  dérive** échoue si le schéma déclare une table ou une colonne qu'aucune migration
  ne crée.
- Le schéma est aussi **rejoué de zéro** par les suites de test et par l'exercice
  d'exploitation : une migration non rejouable est détectée immédiatement.
- **Aucune migration destructive n'a été exécutée**, et aucune ne doit l'être sur
  des données existantes sans autorisation explicite **et** sauvegarde vérifiée.

### 7.4 Retour arrière

Redéployer la version précédente de l'API reste possible tant que les migrations
sont additives. Une migration destructive rendrait le retour arrière impossible
sans restauration complète : elle exige donc une autorisation explicite et une
sauvegarde vérifiée prise juste avant. Procédure détaillée :
`docs/DEPLOYMENT-ARCHITECTURE.md` § 6.

### 7.5 RPO / RTO : hypothèses explicites et portée des mesures

| Objectif | Valeur | Hypothèses |
| --- | --- | --- |
| **RPO** | ≤ 24 h | sauvegarde **quotidienne**. Aucune journalisation continue (*WAL archiving*) : le RPO ne peut pas être inférieur à l'intervalle de sauvegarde |
| **RTO technique** (base + volume) | 0,16 s à 3 s sur base de test selon l'exécution | création de la base + `pg_restore` + extraction du volume, mesuré en CI (§ 7.2) |
| **RTO réel d'incident** | **non mesuré** | inclut détection, décision humaine, bascule et reprise de service |

**Portée, énoncée pour éviter tout malentendu :** ces durées portent sur une base
de test de quelques mégaoctets, sur le disque local d'un exécuteur de CI, sans
concurrence et sans les données réelles. Le RTO d'une infrastructure réelle sera
**supérieur** ; l'extrapolation linéaire n'est pas légitime. La première journée du
pilote doit comprendre un **exercice de restauration sur l'environnement réel**,
dont les durées remplacent celles-ci. Aucune valeur contractuelle n'est annoncée.

---

## 8. Gouvernance des preuves de livraison

### 8.1 Ce qui est outillé

- conservation par défaut : **rien n'est purgé automatiquement** ; la suppression
  est logique (`deletedAt`), auditée, et la ligne reste lisible ;
- purge physique par `ops/prune-proofs.mjs`, qui exige **une date limite explicite**
  (`--before=AAAA-MM-JJ`) **et** une confirmation (`--confirm`) : sans date limite,
  il refuse ; sans confirmation, il se contente de décrire ce qu'il supprimerait ;
- seules les preuves **déjà supprimées logiquement** et antérieures à la date
  limite sont effacées : une preuve active reste, quelle que soit son ancienneté ;
- les lignes de `proof_files` ne sont **jamais** touchées : le journal d'audit et
  les références survivent à la disparition du fichier ; une preuve purgée répond
  `410 Gone` — comportement attendu, pas panne ;
- sauvegarde des preuves intégrée à la chaîne de sauvegarde (§ 7.2), avec
  vérification d'empreinte après restauration.

**La purge est éprouvée sur ses effets, pas sur sa sortie.** L'exercice quotidien
pose trois preuves — une active, une supprimée depuis 400 jours, une supprimée le
jour même — puis vérifie, après purge : le fichier éligible **a disparu**, la preuve
supprimée récemment et l'active sont **toujours là**, et les **trois lignes** de
`proof_files` sont intactes. Avant correction, l'exercice ne supprimait rien : il ne
démontrait que son propre refus, et publiait « rien à purger » sous un titre
trompeur.

### 8.2 Décisions qui exigent une validation humaine

**Aucune durée de conservation n'est imposée par le code.** Elles dépendent du pays,
de la nature de la pièce et de la relation contractuelle. Les fixer à la place du
client reviendrait à prendre une décision qu'il n'a pas prise, sur un sujet où une
erreur ne se rattrape pas : une preuve détruite ne se reconstitue pas.

| Décision | Pourquoi elle appartient au client |
| --- | --- |
| Durée de conservation **par nature** de preuve | un justificatif d'encaissement et une photo de livraison n'ont pas le même usage contentieux |
| Point de départ du décompte | date de livraison, de clôture ou de dernier paiement : détermine ce qui devient éligible |
| Contre-indications (litige, contrôle, demande d'un tiers) | exigent un gel de la purge, donc une procédure humaine |
| Qui ordonne la purge et comment l'exécution est consignée | la purge est irréversible et doit être imputable à une personne |
| Accès en lecture aux preuves hors application | la consultation passe aujourd'hui par l'API, donc par le cloisonnement et les permissions ; un accès direct au volume contournerait ces contrôles |

Politique détaillée et mécanique de purge : `docs/SECURITY-MODEL.md` § « Preuves de
livraison » et `docs/OPERATIONS-RUNBOOK.md` § 6.

---

## 9. Parcours pilote

### 9.1 Ce qui est couvert par les tests automatisés

| Étape du parcours | Couverture automatisée |
| --- | --- |
| Création de mission | `missions.e2e.test.ts` (création, référence, validation) |
| Attribution | affectation, refus d'affectation hors périmètre |
| Livraison et transitions | transitions autorisées **et refusées**, preuve exigée avant clôture |
| Dépôt de preuve | fichier réellement écrit, empreinte recalculée, `415`/`413`/`400`, `410` |
| Doublons | rejeu avec `clientId` ⇒ aucune seconde preuve ; `Idempotency-Key` ⇒ aucune seconde mission |
| Encaissement **déclaré** | `POST /missions/:id/payment`, plafond, idempotence, concurrence |
| Versement | `POST /missions/:id/remittance`, mouvements de caisse symétriques |
| Rapprochement | écart attendu − déclaré − remis calculé et exposé |
| Incidents | `410` sur preuve manquante, `503` sur base absente, `503` sur volume de preuves inutilisable |
| Autorisations | matrice de rôles, cloisonnement inter-entreprises |
| Interruption réseau / reprise | logique de file hors ligne testée **au niveau du domaine** (états, temporisation, `clientId`) — **pas au niveau du navigateur** (§ 9.3) |

### 9.2 Paiements : déclaré n'est pas confirmé

**Aucun fournisseur de paiement n'est configuré ni testé.** Le modèle `Payment`
existe dans le schéma, mais `prisma.payment` **n'est appelé par aucune route de
l'API** : les encaissements passent par `POST /missions/:id/payment` et
`POST /missions/:id/remittance`, qui enregistrent des **déclarations
d'exploitation** et des mouvements de caisse.

Conséquence directe pour le pilote : tout montant constaté est un **montant déclaré
par le livreur**, jamais un paiement confirmé par un opérateur mobile money ou une
banque. Le rapprochement doit donc être **manuel** et documenté (déclaré / remis /
écart), et aucune communication ne doit présenter un encaissement comme confirmé
par un fournisseur.

### 9.3 Décision sur l'expérience hors ligne

**Décision, prise et assumée : aucune expérience hors ligne installable n'est
requise avant le pilote.** La construction d'une PWA est **reportée**, pas
abandonnée : elle est réexaminée après le pilote, sur la base de ce qui aura
réellement manqué sur le terrain. Ce qui reste à valider par le client n'est pas la
décision technique, mais **la contrainte d'exploitation qu'elle implique** — voir la
fin de cette section.

**État réel.** La file d'attente hors ligne (`lib/jotoliko-os/offline-queue.ts`)
est de la **logique seule** : états `EN_ATTENTE` → `SYNCHRONISATION` →
`SYNCHRONISE` / `ECHEC`, clé d'idempotence `clientId`, temporisation croissante de
2 s à 5 min. Il n'existe **ni service worker, ni manifeste, ni stockage navigateur
durable** : l'application n'est pas installable et l'interface ne se charge pas sans
réseau. **Cette file n'est pas une PWA** et ne doit pas être présentée comme telle.

**Décision proposée : ne pas construire de PWA avant le pilote.** Trois raisons :

1. l'objet du pilote est de valider le parcours métier (mission, livraison, preuve,
   encaissement déclaré, rapprochement, incident), pas la couverture réseau ;
2. une PWA utile n'est pas un réglage mais un chantier : service worker, stratégie
   de cache de l'interface, stockage local durable, file de reprise persistante,
   indicateur d'état hors ligne, et surtout **résolution des conflits** quand un
   même document a été modifié des deux côtés. Livrée à moitié, elle serait pire
   que son absence : le livreur croirait pouvoir travailler sans réseau ;
3. l'idempotence serveur existe déjà (`clientId`, `Idempotency-Key`) : la couche
   manquante est côté navigateur et peut être ajoutée **sans changer le contrat
   d'API**.

**Contrainte à accepter explicitement si la décision est maintenue :** sans réseau,
le dépôt d'une preuve et la clôture d'une livraison sont **impossibles**. Le pilote
doit donc se dérouler en zone couverte, ou accepter une saisie différée hors
application (papier, appel). C'est une décision d'exploitation, pas une
caractéristique du logiciel.

### 9.4 Checklist de recette terrain

Vingt scénarios, à exécuter sur un environnement dédié et **jamais sur des données
réelles**, avec relevé de l'heure, de l'acteur et du résultat observé :
`docs/OPERATIONS-RUNBOOK.md` § 9.3. Les scénarios sur les doublons, la coupure
réseau, la reprise et la preuve supprimée sont ceux qui se dégradent le plus vite
en conditions réelles : ils doivent être exécutés **sur le terrain**, avec le
matériel des livreurs, et pas depuis un poste confortablement connecté.

---

## 10. Coûts et fournisseurs

**Aucune dépense n'a été engagée**, aucun compte n'a été créé, aucun service payant
n'a été provisionné. Ce qui suit sert à **décider**, pas à facturer.

### 10.1 Ce qu'il faut dimensionner

Le besoin d'un pilote est modeste et connu : une instance d'API (1 vCPU, 512 Mio à
1 Go), une base PostgreSQL de 10 à 20 Go, un volume persistant pour les preuves, un
support de sauvegarde **distinct** (c'est le poste qu'on oublie), un nom de domaine.

Le poste dominant n'est pas l'API : c'est la **base managée** et, si on la choisit,
elle coûte plus cher que le serveur qui l'héberge.

### 10.2 Prix de liste relevés le 15/10/2026

Prix **mensuels**, hors taxes, tels que rapportés par des comparateurs tiers
consultés le 15/10/2026. Ce ne sont **pas des devis** : les prix des hébergeurs
changent, et le prix réel dépend de la région, de la devise et du mode de facturation.
La colonne « à confirmer » indique ce qu'un devis doit couvrir avant toute décision.

| Option | Coût mensuel rapporté | Ce que ça couvre | À confirmer par devis |
| --- | --- | --- | --- |
| **A. Serveur dédié/privé virtuel, PostgreSQL sur la même machine** (Hetzner CX23 ≈ 5,12 $ ; OVH VPS-1 ≈ 5,85 $) + stockage objet pour les sauvegardes hors site (Hetzner ≈ 5,70 $/To ; OVH ≈ 10,75 $/To) | **≈ 11–17 $** | API, base et volume sur la même machine ; sauvegardes hors site dans le stockage objet | coût des sauvegardes du volume, trafic sortant au-delà du forfait, prix de la région |
| **B. Plateforme applicative à l'usage + base métriquée** (Railway Hobby : 5 $ de crédit puis à l'usage ; base 256 Mio de RAM ≈ 2,50 $/mois mémoire, volume 0,15 $/Go) | **≈ 5–15 $** | conteneur applicatif, base et volume, mises à jour de la plateforme | plafond de dépense (aucun par défaut), coût du trafic, durée de rétention des sauvegardes incluses |
| **C. Plateforme + base managée** (Fly.io : machine 3,69–6,70 $ + Managed Postgres Basic 38 $ + volume 10 Go ≈ 2,80 $ ; OVH PostgreSQL Essential ≈ 51,26 $) | **≈ 45–52 $** | haute disponibilité, sauvegardes automatisées, bascule automatique, redimensionnement | périmètre exact des sauvegardes incluses, coût d'une restauration à la demande, conditions de réversibilité |

Sources consultées : [pricing Fly.io 2026](https://temps.sh/blog/fly-io-pricing-2026),
[comparatif PaaS septembre 2026](https://bex.co/blog/2026/09/19/paas-pricing-shakeup-ledger-render-heroku-hetzner),
[options d'hébergement PostgreSQL](https://flaviocopes.com/database-hosting-options/),
[OVH vs Railway](https://getdeploying.com/ovh-vs-railway),
[Hetzner vs Railway](https://getdeploying.com/hetzner-vs-railway).

### 10.3 Recommandation, et ce qu'elle coûte en travail

Pour un **pilote**, l'option A (ou B) suffit : environ **5 à 17 $ par mois**. L'option
C coûte trois à dix fois plus, et achète une disponibilité dont un pilote n'a pas
besoin — mais elle achète aussi une chose réelle : **des sauvegardes dont quelqu'un
d'autre répond**, et une restauration que l'on n'a pas à écrire soi-même.

L'option A déplace donc le coût du budget vers le travail : c'est nous qui exécutons
`ops/backup.mjs` chaque nuit, qui surveillons l'espace du volume, et qui réparons.
C'est faisable — c'est précisément ce que cette phase a outillé et éprouvé — mais
**c'est une astreinte**, et elle doit être acceptée explicitement, pas découverte
après la première panne.

Points contractuels à vérifier avant de choisir, quelle que soit l'option :

- **localisation des données** : pays d'hébergement et de réplication (une exigence
  de localisation peut éliminer une option à elle seule) ;
- **rétention des sauvegardes** incluses, et coût d'une restauration à la demande ;
- **réversibilité** : pouvoir récupérer la base et les preuves en fin de contrat,
  dans un format exploitable ;
- **plafond de dépense** : les offres à l'usage (option B) n'en ont pas par défaut.

### 10.4 Interdiction maintenue

Aucun provisionnement, aucun compte, aucun engagement de dépense sans
**autorisation explicite**. La présente section donne les éléments de décision ; elle
n'autorise rien.

## 11. Écarts restants

| # | Écart | Impact | État |
| --- | --- | --- | --- |
| 1 | Staging non provisionné | bloque le pilote opérationnel | décision et dépense à autoriser (§ 10) |
| 2 | Sauvegarde planifiée de production inexistante | RPO réel non garanti ; la chaîne est éprouvée en CI, **pas** en exploitation | outillage prêt (`ops/`), planification à installer |
| 3 | Alerte sans destinataire | une panne ne préviendrait personne | `BACKUP_ALERT_COMMAND` et sonde prêts ; destinataire à désigner |
| 4 | RTO réel non mesuré | aucune garantie de délai de reprise | exercice à faire sur l'environnement réel |
| 5 | Rétention des preuves non arrêtée par le client | purge impossible à planifier | `ops/prune-proofs.mjs` prêt, sans durée par défaut |
| 6 | Décision hors ligne à valider | conditionne le déroulement du pilote | décision proposée et argumentée (§ 9.3) |
| 7 | Encaissements déclaratifs seulement | aucun rapprochement automatique avec un opérateur | rapprochement manuel documenté (§ 9.2) |
| 8 | Douze avis de dépendances (dont 3 côté API, dans la CLI Prisma) | aucun avis dans la surface d'exécution de l'API ; remédiation = montée majeure | à décider, hors préparation de pilote (§ 5.6) |
| 9 | Multi-instances | le stockage des preuves est un volume local : pas de montée en charge horizontale sans volume partagé ou stockage objet | hors périmètre pilote, documenté |
| 10 | Fonctions absentes | notifications (SMS/WhatsApp), fournisseur de paiement, WAF, rotation de secret, chiffrement au repos, purge automatique, interface d'administration | documentées comme absentes, non annoncées comme disponibles |
| 11 | Aucun script `lint` | pas de contrôle de style automatique | écart de qualité, pas de sécurité ; non contourné par un faux script |

---

## 12. Ce que ce rapport ne prétend pas

- **Ne pas confondre CI verte et service opérationnel.** Les cinq vérifications
  vertes prouvent que le code fonctionne sur une base de test, pas qu'un service
  rendu à un client fonctionne.
- **Ne pas confondre restauration de test et sauvegarde opérationnelle.** La chaîne
  est exécutée et mesurée en CI ; **aucune** sauvegarde de production n'existe.
- **Ne pas confondre RTO mesuré et RTO contractuel.** Les durées citées portent sur
  une base de test (§ 7.5).
- **Ne pas confondre déclaré et confirmé.** Aucun paiement n'est confirmé par un
  fournisseur (§ 9.2).
- **Ne pas confondre file d'attente et PWA.** Aucun service worker, aucun
  manifeste : rien n'est installable, rien ne fonctionne hors réseau (§ 9.3).
- **Ne pas confondre preuve enregistrée et preuve conservée.** Une preuve supprimée
  logiquement reste auditable, mais son fichier n'est plus servi (`410`) ; la
  conservation durable dépend de la sauvegarde du volume (§ 8).
- Le maintien de la PR #3 et l'absence de fusion ou de déploiement ne sont pas des
  prudences décoratives : ce sont des contraintes explicites de la mission.

---

## 13. Prérequis

### 13.1 Conditions du pilote **technique** (soutenables aujourd'hui)

1. Périmètre restreint et équipe technique identifiée.
2. Aucune donnée de production : l'environnement reste isolé.
3. Sauvegarde manuelle **base + volume** avant toute manipulation de données, via
   `ops/backup.mjs`, et restauration vérifiée par `ops/restore-verify.mjs`.
4. Aucune migration destructive.
5. Les défauts constatés sont consignés, pas contournés.
6. `AUTH_SECRET` propre à l'environnement, jamais versionné.

### 13.2 Conditions du pilote **opérationnel contrôlé**

1. Staging provisionné, configuré et validé (§ 7.1), après **devis** sur la base
   des prix relevés (§ 10) et **autorisation explicite de dépense**.
2. Sauvegarde **planifiée** sur cet environnement, alertes aboutissant à un
   responsable désigné, et **exercice de restauration chronométré** sur place.
3. Politique de rétention des preuves arrêtée par le client (§ 8.2).
4. Décision explicite sur l'usage hors ligne (§ 9.3) et information des livreurs.
5. Checklist terrain exécutée (§ 9.4), en particulier les scénarios de doublons, de
   coupure réseau et de reprise.
6. Procédure d'incident connue des intervenants et responsables désignés
   (`docs/OPERATIONS-RUNBOOK.md` § 7 et § 8).

### 13.3 Interdits maintenus

- **Aucun déploiement de production** sans autorisation explicite.
- **Aucune migration destructive** sur des données existantes sans autorisation
  explicite **et** sauvegarde vérifiée.
- **Aucun test désactivé** pour obtenir une CI verte ; aucun échec masqué.
- **Aucun provisionnement payant** ni dépense engagée sans autorisation.
- **Aucune fusion** de PR sans autorisation explicite ; PR #3 préservée.

---

## Annexe — Reproduire ces vérifications

```bash
# 1. Socle local (sans base de données)
npm ci && npm --prefix apps/api ci
npm run typecheck            # 0 erreur
npm run api:typecheck        # 0 erreur
npm run ops:typecheck        # 0 erreur (checkJs sur ops/)
npm test                     # 171 réussis, 1 ignoré
npm run api:build            # doit produire apps/api/dist/apps/api/src/main.js
npm run api:smoke            # 26/26 — API réelle, sans base exploitable

# 2. Bout en bout (exige PostgreSQL 16 réel et le client Prisma généré)
npm run api:build && npm run test:e2e:api     # 115 cas, dont 8 pour les scripts d'exploitation

# 3. Chaîne d'exploitation (exige pg_dump, pg_restore, psql)
node ops/backup.mjs --dry-run                              # simulation, aucune écriture
BACKUP_DIR=… PROOF_STORAGE_DIR=… node ops/backup.mjs       # sauvegarde base + volume
BACKUP_DIR=… node ops/restore-verify.mjs                   # restauration vérifiée et mesurée
node ops/prune-proofs.mjs --before=AAAA-MM-JJ               # simulation de purge
node ops/healthcheck.mjs --url=https://api.exemple.org     # 0/1/2 selon l'état

# 4. Audit des dépendances (informatif, jamais bloquant)
node scripts/npm-audit-summary.mjs . "racine (site + outillage)"
node scripts/npm-audit-summary.mjs apps/api "API (dépendances d'exécution)"

# 5. CI
gh pr checks 4               # 5 vérifications
gh run list --branch arena/dd76021f-jotoliko
# Bilan des cas exécutés : annotation « E2E-BILAN » du job e2e
# Mesures de restauration : annotations « RTO-MESURÉ » et « PORTÉE-DE-LA-MESURE »
```

**Lecture des annotations.** Les journaux des exécuteurs ne sont pas toujours
téléchargeables depuis l'extérieur ; les résultats, bilans et mesures sont donc
publiés en annotations, lisibles par l'API GitHub :

```bash
gh api "repos/aydiarra-star/Jotoliko/check-runs/<job_id>/annotations"
```

*Rapport établi sur les preuves exécutées par les exécutions CI
[38722779519](https://github.com/aydiarra-star/Jotoliko/actions/runs/38722779519),
[38722779274](https://github.com/aydiarra-star/Jotoliko/actions/runs/38722779274) et
[38722779360](https://github.com/aydiarra-star/Jotoliko/actions/runs/38722779360) de
la branche `arena/dd76021f-jotoliko`, et sur les suites locales du même état de
l'arbre. Les durées mesurées sont attachées à un état du code : **toute évolution
ultérieure du code les invalide** et exige de les reproduire — les commandes de
contrôle sont données en annexe. Seules des modifications de documentation séparent
ces exécutions de l'état livré.*
