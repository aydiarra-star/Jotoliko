# Architecture de déploiement — procédures et état réel

Ce document décrit la topologie cible, les procédures de migration, de sauvegarde,
de restauration et de retour arrière, et — séparément — **ce qui a été exécuté et
vérifié**. La distinction est tenue partout : une procédure écrite n'est pas une
procédure éprouvée.

## 1. Topologie

```
Navigateur / PWA          Opérateur
      │                       │
      ▼                       ▼
Site Next.js (export     API NestJS ──── volume de preuves
statique) ──────────────▶ (apps/api)      (PROOF_STORAGE_DIR)
                              │
                              ▼
                        PostgreSQL 16
```

- Le **site** (Next.js, export statique) et l'**API** sont deux déploiements
  distincts. Le site publié sur GitHub Pages n'est **pas** un backend : il ne
  contient aucun secret et n'accède à aucune base.
- L'**API** est le seul composant qui parle à PostgreSQL et au volume de preuves.
- Les **preuves** sont stockées sur un volume persistant propre à l'API, jamais
  dans la base (voir `docs/SECURITY-MODEL.md`, § 10). Un volume éphémère perdrait
  toutes les pièces justificatives à chaque redéploiement ; l'API refuse de
  démarrer en production sans `PROOF_STORAGE_DIR`.

## 2. Environnements

| Environnement | État | Rôle |
| --- | --- | --- |
| Local | existe | `npm run test`, `npm run api:build`, `npm run api:smoke` (sans base) |
| CI (`postgres:16`) | **existe et s'exécute** | migrations, tests de schéma, suite HTTP de bout en bout, sauvegarde/restauration |
| Staging | **non provisionné** | validation avant pilote |
| Production | **jamais déployé** | — |

### Staging : ce qui manque exactement

Aucun environnement de staging n'est provisionné, et cette absence n'est pas
contournée par une simulation. Pour le créer, il faut de façon nominative :

1. une **instance PostgreSQL** dédiée (jamais la base de production), avec une
   URL de connexion ;
2. un **hébergement pour l'API** capable de monter un **volume persistant** (sans
   quoi les preuves ne survivent pas à un redéploiement) ;
3. un **`AUTH_SECRET`** propre au staging, d'au moins 32 caractères, distinct de
   toute autre valeur ;
4. la liste exacte des **origines CORS** du staging, et le **nombre réel de
   proxies** devant l'API (`TRUST_PROXY_HOPS`) ;
5. un **accès à l'espace de sauvegarde** (voir § 5) avec les outils `pg_dump`,
   `pg_restore` et `psql` disponibles dans l'environnement d'exécution.

Aucun de ces cinq éléments n'est disponible à ce jour : le staging est
**bloqué** sur des ressources et des autorisations externes, pas sur du code. Le
travail qui ne dépend pas d'eux (configuration, migrations, procédures, suite de
tests, vérification de restauration en CI) est fait ; le reste est décrit ici sans
être exécuté.

## 3. Configuration

Toutes les variables sont documentées dans `.env.example`, qui ne liste que des
variables **réellement lues** par le code.

| Variable | Obligatoire | Défaut | Rôle |
| --- | --- | --- | --- |
| `DATABASE_URL` | oui | — | connexion PostgreSQL (`postgres://` ou `postgresql://`) |
| `AUTH_SECRET` | oui | — | signature des jetons, **32 caractères minimum** |
| `CORS_ORIGIN` | oui | — | origines autorisées, séparées par des virgules ; aucun défaut permissif |
| `PORT` | non | `4000` | port d'écoute, sur `0.0.0.0` |
| `TRUST_PROXY_HOPS` | non | `0` | nombre de proxies de confiance (0 = `X-Forwarded-For` ignoré) |
| `PROOF_STORAGE_DIR` | **en production** | `./var/proofs` | volume persistant des preuves |
| `NEXT_PUBLIC_SITE_URL` | non | `https://jotoliko.com` | URL publique du site |
| `NEXT_PUBLIC_BASE_PATH` | non | `""` | sous-chemin du site (GitHub Pages) |

**La configuration est bloquante, jamais dégradée.** Un secret absent ou trop
court, un `CORS_ORIGIN` vide, un `PORT` hors plage, un `TRUST_PROXY_HOPS` non
entier (borné à 10) ou un répertoire de preuves inutilisable **empêchent le
démarrage**. Une valeur d'exemple connue pour `AUTH_SECRET` est refusée en
production.

**Les secrets ne sont jamais versionnés.** Ils sont fournis par le gestionnaire de
secrets de l'hébergeur. `.env.example` ne contient que des valeurs vides ou
locales.

**Indisponibilité de la base au démarrage :** l'API démarre malgré tout et se
déclare **non prête** (`/health/ready` → `503`,
`checks.database = "unreachable"`). Un processus qui sortirait sur une coupure
passagère partirait en boucle de redémarrage et ne se rétablirait pas seul ; la
sonde de disponibilité est le mécanisme prévu pour retirer l'instance du routage.
La configuration, elle, reste bloquante comme décrit ci-dessus.

## 4. Migrations

- Les migrations sont **versionnées** dans `prisma/migrations/` et appliquées par
  `prisma migrate deploy` — jamais par `migrate dev` sur un environnement partagé.
- **Discipline additive** : une migration n'altère ni ne supprime de colonne
  existante sans autorisation explicite et sauvegarde vérifiée. La dernière
  migration (`proof_delivery_storage`) ne fait que créer une table.
- **Vérification avant application** : en CI, le schéma Prisma est confronté aux
  migrations (`schema-drift`) et la table attendue est vérifiée dans
  `information_schema` sur un PostgreSQL réel. Une table déclarée sans migration
  fait échouer la CI.
- **Rejouabilité** : les tests de bout en bout recréent le schéma de zéro
  (`DROP SCHEMA public CASCADE` puis application de toutes les migrations dans
  l'ordre). C'est la même exigence que pour une restauration.
- **Ne jamais supposer que Prisma est opérationnel** parce qu'il est présent : la
  génération du client, la cohérence du schéma et l'application des migrations sont
  vérifiées séparément sur une base de test dédiée.

**Procédure avant toute migration en staging ou en production :**

1. vérifier la sauvegarde (voir § 5) et que sa restauration a été testée ;
2. relire la migration : est-elle additive ? que se passe-t-il si elle échoue à
   mi-parcours ?
3. appliquer en staging d'abord, sur une copie restaurée de la base de production ;
4. vérifier les données, les contraintes et les relations **après** application ;
5. seulement alors, appliquer en production, avec la fenêtre de retour arrière
   connue (§ 6).

**Aucune migration destructive n'a été exécutée**, et aucune ne doit l'être sans
autorisation explicite et sauvegarde vérifiée.

## 5. Sauvegarde

**Deux éléments à sauvegarder, jamais un seul :**

1. **PostgreSQL** — `pg_dump --format=custom` (format permettant une restauration
   sélective et parallèle, et vérifiable par `pg_restore --list`) ;
2. **le volume de preuves** (`PROOF_STORAGE_DIR`) — les fichiers eux-mêmes.

Une sauvegarde de la base seule conserve les empreintes et les références mais
**pas les pièces justificatives** : après restauration, chaque téléchargement
renverrait `410`. La sauvegarde du volume seul ne suffit pas non plus : sans les
lignes, plus rien ne référence les fichiers.

**Ce qui est vérifié aujourd'hui :** la suite
`tests/api-e2e/backup-restore.e2e.test.ts` exécute réellement `pg_dump` puis
`pg_restore` dans une base **isolée** (nom tiré au sort, `DROP DATABASE … WITH
(FORCE)` en fin de test), et contrôle après restauration :

- les données restaurées (entreprise, mission, preuve, caisse) ;
- la ligne de preuve et son empreinte ;
- le journal d'audit ;
- que les **contraintes sont toujours actives** après restauration (clés
  étrangères, unicité, `CHECK`) — une restauration qui « réussit » en désactivant
  les contraintes n'est pas une restauration ;
- la table `_prisma_migrations` (état des migrations cohérent après restauration).

Si les outils `pg_dump`/`pg_restore`/`psql` sont absents de l'environnement, la
suite se **saute explicitement** avec un avertissement — elle n'échoue pas et ne
fait jamais croire à une vérification qui n'a pas eu lieu.

**Ce qui n'est pas encore fait :** aucune sauvegarde planifiée de production
n'existe (aucune production), aucune politique de rétention n'est arrêtée, et le
couple sauvegarde base + volume n'a pas encore été exécuté sur un environnement
réel. Ces points sont des prérequis de pilote, listés dans le rapport de
préparation.

**Recommandations à arrêter avec l'hébergeur :** sauvegarde quotidienne chiffrée,
conservation glissante (par exemple 7 quotidiennes + 4 hebdomadaires), stockage
dans un espace distinct de la production, et **test de restauration périodique** —
une sauvegarde jamais restaurée n'est pas une sauvegarde.

## 6. Restauration et retour arrière

### Restaurer une sauvegarde

1. **Ne jamais restaurer par-dessus l'existant.** Créer une base isolée.
2. `pg_restore --clean --if-exists --no-owner --dbname <base_isolée> <sauvegarde>`.
3. Vérifier : nombre de lignes des tables principales, présence des contraintes
   (`pg_constraint`), intégrité référentielle, table `_prisma_migrations`, et
   comparaison d'une empreinte de preuve connue.
4. Restaurer le volume de preuves correspondant, puis vérifier qu'un
   téléchargement de preuve aboutit (`200`) et non `410`.
5. Basculer le trafic seulement après ces vérifications.

### Retour arrière applicatif (rollback)

- Redéployer la version précédente de l'API : c'est la raison pour laquelle toute
  migration doit être **additive** — une version antérieure de l'application doit
  continuer à fonctionner sur le schéma le plus récent.
- Une migration **destructive** rend le retour arrière impossible sans restauration
  complète : elle exige donc une autorisation explicite et une sauvegarde vérifiée
  prise juste avant.
- **Conditions de récupération** : le retour arrière est possible si et seulement
  si (a) le schéma reste compatible avec la version précédente, et (b) la sauvegarde
  base **et** volume a été vérifiée. Si l'une des deux manque, la seule option est
  une restauration complète, avec la perte des données postérieures à la
  sauvegarde.
- **Objectifs de reprise (RTO/RPO) : non définis et non mesurés.** Aucune
  restauration réelle n'a été chronométrée : ne pas annoncer de durée de
  rétablissement avant de l'avoir mesurée en staging.

## 7. Supervision et exploitation

- **`GET /health/live`** — vivacité : le processus répond. Ne touche à aucune
  dépendance. C'est la sonde à utiliser pour un redémarrage de conteneur.
- **`GET /health/ready`** — disponibilité : exécute `SELECT 1`. `200` si la base
  répond, `503` sinon. C'est la sonde qui doit **retirer l'instance du routage**.
- **Journaux** : un identifiant de corrélation est présent sur chaque réponse et
  dans chaque ligne concernée, y compris pour une requête rejetée par l'analyseur
  de corps. Les journaux ne contiennent ni secret, ni jeton, ni contenu de preuve.
- **Erreurs 5xx** : volontairement muettes côté client ; la cause complète
  (pile d'appels, message du moteur) est dans les journaux serveur, à corréler par
  identifiant de requête. C'est le premier réflexe de diagnostic.
- **Aucune supervision externe, alerte ou agrégation de journaux n'est
  configurée.** À prévoir avec l'hébergeur ; les sondes ci-dessus sont le point
  d'accroche.

## 8. Déploiement

**Aucun déploiement de production n'a été effectué, et aucun ne doit l'être sans
autorisation explicite.** Le pilote contrôlé suppose au minimum : un staging
provisionné et validé (§ 2), une sauvegarde base + volume vérifiée (§ 5), une
restauration testée (§ 6), les sondes branchées (§ 7) et une durée de conservation
des preuves arrêtée avec le client.
