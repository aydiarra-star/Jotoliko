# Runbook d'exploitation — Jotoliko API

Ce document décrit ce qui est **réellement outillé** aujourd'hui pour surveiller,
sauvegarder, restaurer et purger Jotoliko, et ce qui reste une **décision humaine**
avant le pilote opérationnel.

Règle de lecture : chaque affirmation renvoie à un fichier ou à un test. Une
capacité qui n'a jamais été exécutée est signalée comme telle. Le lexique est
volontairement strict :

- **outillé et vérifié** — le code existe et un test l'exerce (unitaire, ou
  système en CI avec PostgreSQL) ;
- **outillé, non exécuté en conditions réelles** — le code existe, il tourne en
  CI sur une base de test, mais personne ne l'a encore lancé sur une
  infrastructure d'exploitation ;
- **à décider / à désigner** — aucune valeur par défaut n'est imposée ici.

---

## 1. Ce qui existe aujourd'hui

| Domaine | Outil | Emplacement | État |
| --- | --- | --- | --- |
| Sondes de santé | `GET /health`, `/health/live`, `/health/ready` | `apps/api/src/health.controller.ts` | outillé et vérifié |
| Sonde d'alerting | `ops/healthcheck.mjs` | `ops/healthcheck.mjs` | outillé et vérifié |
| Sauvegarde base + preuves | `ops/backup.mjs` | `ops/backup.mjs` | outillé, **non exécuté en conditions réelles** |
| Restauration vérifiée et mesurée | `ops/restore-verify.mjs` | `ops/restore-verify.mjs` | outillé, **non exécuté en conditions réelles** |
| Purge des preuves échues | `ops/prune-proofs.mjs` | `ops/prune-proofs.mjs` | outillé et vérifié |
| Socle commun (manifeste, rétention, santé) | `ops/lib/ops-core.mjs` | `ops/lib/ops-core.mjs` | outillé et vérifié |

Tests associés :

- `tests/unit/ops-core.test.ts` — configuration, manifeste, intégrité, rétention,
  décision de disponibilité, plan de purge, aller-retour de chiffrement réel.
- `tests/api-e2e/ops-scripts.e2e.test.ts` — exécution **réelle** des quatre
  scripts sur PostgreSQL, avec un volume de preuves contenant de vrais fichiers.
- `scripts/api-offline-smoke.mjs` — sondes de santé sans base de données.

> **Ce qui n'existe pas.** Aucun environnement de staging n'est provisionné, aucune
> sauvegarde planifiée de production n'est en place, aucune alerte n'est branchée
> sur un canal réel. Les mesures publiées par la CI proviennent d'une base de test
> PostgreSQL 16 dans un exécuteur GitHub — voir §5 pour ce que cela vaut, et ce que
> cela ne vaut pas.

---

## 2. Superviser

### 2.1 Ce que disent les sondes

`GET /health/live` — le processus répond. Il ne touche à **aucune** dépendance :
un service dont la base est momentanément absente ne doit pas être redémarré en
boucle par l'orchestrateur.

`GET /health/ready` — vérifie réellement les deux dépendances de service :

```json
{
  "status": "ready",
  "service": "jotoliko-api",
  "checks": { "database": "ok", "storage": "ok" },
  "storageFreeBytes": 41234513920,
  "storageMinFreeBytes": 268435456
}
```

- `200` avec `status: "ready"` → l'instance peut recevoir du trafic ;
- `503` avec `status: "degraded"` → **retirer l'instance du routage**. Le détail
  est dans `checks` : `database` (`ok` | `unreachable`) et `storage` (`ok`, ou la
  raison : `INDISPONIBLE`, `NON_INSCRIPTIBLE`, `ESPACE_INSUFFISANT`).

Pourquoi le volume de preuves est-il une condition de disponibilité ? Parce qu'une
API qui accepte une livraison alors que la photo ne peut plus être écrite ne
découvre la panne qu'au moment où un livreur clôture devant un client. Le seuil est
réglable par `PROOF_STORAGE_MIN_FREE_BYTES` (défaut : 256 Mio). `storageFreeBytes`
est publié dans **chaque** réponse pour permettre une alerte **avant** saturation.

### 2.2 La sonde d'alerting

`ops/healthcheck.mjs` interroge les deux sondes et conclut par un code de sortie —
c'est le contrat avec l'outil de supervision :

| Code | État | Ce qu'il faut faire |
| --- | --- | --- |
| `0` | `DISPONIBLE` | rien |
| `1` | `DEGRADE` | alerter : l'instance est retirée du routage mais le processus vit |
| `2` | `INDISPONIBLE` | intervenir : le service ne répond pas |

```bash
API_BASE_URL="https://api.exemple.org" node ops/healthcheck.mjs
# ou : node ops/healthcheck.mjs --url=https://api.exemple.org --timeout=20000
```

Le délai d'attente doit rester **supérieur** au délai interne de tentative de
connexion à la base (`CONNECT_ATTEMPT_TIMEOUT_MS`, 10 s). Avec un délai plus court,
une base lente est classée « injoignable » alors qu'elle est seulement lente.

### 2.3 Seuils et alertes à définir

Les seuils ci-dessous sont **proposés** : ils ne sont branchés sur aucun canal tant
qu'un destinataire n'a pas été désigné (§7).

| Signal | Seuil proposé | Source |
| --- | --- | --- |
| Instance non disponible | 2 échecs consécutifs de la sonde (code 2) | `ops/healthcheck.mjs` |
| Instance dégradée | 1 échec de la sonde (code 1) | `ops/healthcheck.mjs` |
| Espace de preuves | `storageFreeBytes` < 2 × `storageMinFreeBytes` | `/health/ready` |
| Échec de sauvegarde | `status.json` de la dernière sauvegarde avec `ok: false`, ou absence de sauvegarde > 26 h | `ops/backup.mjs`, `BACKUP_DIR` |
| Échec de restauration d'essai | `restore-report.json` avec `ok: false` | `ops/restore-verify.mjs` |
| Taux d'erreurs HTTP | à calibrer pendant le pilote (aucune valeur mesurée à ce jour) | journaux de l'API |

`ops/backup.mjs` exécute `BACKUP_ALERT_COMMAND` lorsqu'une sauvegarde échoue **et**
écrit `status.json` en cas de succès comme d'échec. Sans `BACKUP_ALERT_COMMAND`, le
script affiche explicitement qu'**aucune alerte n'a été transmise** : il n'y a pas
de fausse alerte silencieuse.

### 2.4 Journaux

Les journaux de l'API sont corrélés par `X-Request-Id`
(`apps/api/src/common/request-id.middleware.ts`) : l'identifiant est renvoyé au
client et repris dans la colonne `requestId` du journal d'audit, ce qui permet de
relier une mutation en base à la requête HTTP qui l'a produite. Un identifiant
fourni par le client n'est accepté que s'il est sobre (motif `[\w.:-]{8,128}`),
donc aucun contenu arbitraire ne peut être injecté dans les journaux.

Au démarrage, l'API journalise `describeConfig(config)`
(`apps/api/src/config.ts`), qui n'expose **aucun secret** : le secret
d'authentification y apparaît sous la forme `[48 caractères]`, jamais sa valeur.
Voir `docs/SECURITY-MODEL.md` pour la revue complète.

Ce qu'il reste à faire avant le pilote : vérifier sur les journaux réels du staging
qu'aucune donnée personnelle inutile (numéro de téléphone client, nom du
destinataire dans une URL, jeton) n'apparaît. C'est une vérification **sur
environnement**, pas une propriété du code.

---

## 3. Sauvegarder

### 3.1 Ce qui est sauvegardé, et pourquoi les deux

`ops/backup.mjs` produit **deux** artefacts dans chaque sauvegarde :

1. un vidage logique PostgreSQL (`pg_dump --format=custom --no-owner --no-privileges`) ;
2. une archive du volume de preuves (`tar -czf` de `PROOF_STORAGE_DIR`).

Les preuves de livraison vivent **hors** de la base : la base ne contient que
l'empreinte SHA-256 et la clé de stockage. Une sauvegarde de la base seule conserve
donc des références vers des fichiers qui n'existent plus, et tout téléchargement de
preuve échoue en `410`. Ce n'est pas une hypothèse : la phase A de
`ops/restore-verify.mjs` **compte** ces preuves orphelines et publie le résultat.

Le script refuse de démarrer si `PROOF_STORAGE_DIR` est absent de la configuration.
C'est délibéré : une sauvegarde partielle silencieuse est plus dangereuse qu'une
absence de sauvegarde, parce qu'elle donne confiance.

### 3.2 Configuration

| Variable | Rôle | Valeur par défaut |
| --- | --- | --- |
| `BACKUP_DIR` | Destination des sauvegardes. **Obligatoire.** Sur un support distinct de la production. | — |
| `DATABASE_URL` | Source. Obligatoire, schéma `postgres://` ou `postgresql://`. | — |
| `PROOF_STORAGE_DIR` | Volume des preuves. Obligatoire. | — |
| `BACKUP_ENCRYPTION` | `none` ou `openssl-aes256`. | `none` |
| `BACKUP_ENCRYPTION_KEY_FILE` | Fichier contenant la phrase de chiffrement. Obligatoire si chiffrement actif. Doit être en mode `600`. | — |
| `BACKUP_KEEP_DAILY` | Nombre de sauvegardes récentes conservées. | `7` |
| `BACKUP_KEEP_WEEKLY` | Nombre de jours d'archive distincts conservés. | `4` |
| `BACKUP_MIN_FREE_BYTES` | Espace libre minimal exigé sur `BACKUP_DIR`. | `536870912` (512 Mio) |
| `BACKUP_ALERT_COMMAND` | Commande exécutée en cas d'échec. | aucune (avertissement explicite) |
| `PG_BIN_DIR` | Ajouté au `PATH` par l'ordonnanceur si les clients PostgreSQL ne sont pas dans le `PATH`. | — |

Le mode `600` de la clé est vérifié : une clé lisible par tous annule le bénéfice du
chiffrement, puisqu'elle voyage avec la sauvegarde.

```bash
# Sauvegarde complète (chiffrée)
BACKUP_DIR=/srv/sauvegardes/jotoliko \
DATABASE_URL="postgresql://…" \
PROOF_STORAGE_DIR=/srv/preuves \
BACKUP_ENCRYPTION=openssl-aes256 \
BACKUP_ENCRYPTION_KEY_FILE=/etc/jotoliko/cle-sauvegarde \
node ops/backup.mjs

# Simulation : décrit ce qui serait fait, n'écrit rien
node ops/backup.mjs --dry-run
```

### 3.3 Chiffrement, accès, intégrité

**Chiffrement** — `openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000`. La phrase
de chiffrement est passée par fichier (`-pass file:`), **jamais** en argument de
commande : un secret en argument est lisible par tout utilisateur de la machine via
la table des processus et se retrouve dans l'historique du shell. Le suffixe `.enc`
n'apparaît que si le chiffrement est actif — un nom de fichier ne doit pas laisser
croire à un contenu chiffré.

**Secrets dans la ligne de commande** — deux précautions, vérifiées par des tests :

- le mot de passe de la base est transmis à `pg_dump`/`pg_restore` par
  l'environnement (`PGPASSWORD`), **jamais** en argument : un mot de passe en
  argument est lisible par tout utilisateur de la machine via la table des
  processus (`ps`) et par tout journal qui recopie la ligne de commande ;
- la phrase de chiffrement est passée à `openssl` par **fichier** (`-pass file:`),
  pour la même raison.

**Accès** — les sauvegardes contiennent l'intégralité des données d'exploitation et
les pièces justificatives : elles relèvent du même niveau de protection que la
production. Le compte qui écrit les sauvegardes n'a pas besoin d'accéder à l'API, et
inversement. Les destinataires de `BACKUP_ALERT_COMMAND` ne doivent recevoir que des
noms de fichiers, jamais un extrait de donnée.

**Intégrité** — chaque artefact porte **deux** empreintes : `sha256` sur les octets
stockés (détecte une altération du support, y compris sur un fichier chiffré) et
`contentSha256` sur les octets en clair (valide qu'une restauration restitue bien
l'original). Le script relit ce qu'il vient d'écrire avant de le déclarer valide.
Une clé erronée produit un échec franc, jamais un fichier silencieusement faux.

### 3.4 Rétention

- La sauvegarde **la plus récente n'est jamais supprimée**, quel que soit le réglage :
  c'est la seule qui protège contre une erreur humaine immédiate.
- Les `BACKUP_KEEP_DAILY` plus récentes sont conservées.
- Une sauvegarde par jour d'archive est conservée sur `BACKUP_KEEP_WEEKLY` jours
  distincts, pour couvrir le cas « le problème datait de la semaine dernière et
  personne ne l'a vu ».
- La rétention ne s'applique qu'après une sauvegarde réussie (`--skip-retention`
  permet de l'ajourner).

### 3.5 Planification

Aucune planification n'est installée : elle relève de l'infrastructure. Un
ordonnanceur système suffit, avec les propriétés suivantes :

- exécution **quotidienne** à heure creuse, plus une exécution devant précéder toute
  opération de maintenance ;
- l'échec doit être **bruyant** (`BACKUP_ALERT_COMMAND`, code de sortie non nul) ;
- un verrou empêche deux sauvegardes simultanées ;
- le journal d'exécution est conservé au moins sur la fenêtre de rétention.

---

## 4. Restaurer

### 4.1 Procédure

```bash
# Vérification à blanc sur la dernière sauvegarde, dans une base isolée
DATABASE_URL="postgresql://…" \
BACKUP_DIR=/srv/sauvegardes/jotoliko \
BACKUP_ENCRYPTION_KEY_FILE=/etc/jotoliko/cle-sauvegarde \
node ops/restore-verify.mjs
```

Le script restaure dans une base nommée `jotoliko_verif_<aléatoire>`, **toujours**
supprimée à la fin, y compris en cas d'échec — une vérification qui laisse des
copies de production derrière elle crée le problème qu'elle prétend prévenir. Il ne
touche jamais la base source : il la lit pour comparer.

Deux phases, parce qu'elles répondent à deux questions différentes :

- **phase A — « base seule »** : restaure uniquement la base, volume vide. Compte les
  preuves référencées sans fichier. C'est la justification chiffrée de sauvegarder le
  volume, publiée dans les annotations CI sous `RESTAURATION-RISQUE`.
- **phase B — « base + volume »** : restaure les deux, puis compare le schéma, les
  comptages par table, les contraintes (clé étrangère, unicité) et surtout **les
  empreintes** : chaque preuve référencée en base doit exister après extraction, avec
  la même empreinte SHA-256.

Le rapport `restore-report.json` contient les durées réellement mesurées.

### 4.2 Restauration d'incident (à exécuter par un humain)

1. **Décider** l'arrêt des écritures (mise hors service de l'API) — une restauration
   pendant que l'API écrit produit une perte silencieuse.
2. **Identifier** la sauvegarde cible (`latest.json`, ou le répertoire horodaté
   correspondant au moment voulu).
3. **Restaurer la base** dans une base neuve :
   `pg_restore --no-owner --no-privileges --dbname=… database.dump` (précédé du
   déchiffrement `openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass file:<clé>`).
4. **Restaurer le volume** : `tar -xzf proofs.tar.gz -C <PROOF_STORAGE_DIR>`.
5. **Vérifier** : `ops/restore-verify.mjs` sur l'ensemble, plus un téléchargement de
   preuve réel via l'API.
6. **Reprendre** le service, puis vérifier que le nombre de missions et de preuves
   correspond à l'attendu.
7. **Consigner** : heure de décision, sauvegarde utilisée, durée de chaque étape,
   écart de données constaté. Ces chiffres alimentent le RTO réel.

> Étape 5 : un téléchargement de preuve est la seule vérification qui prouve la
> chaîne complète. Un comptage de tables ne détecte pas un volume de preuves monté
> sur le mauvais chemin.

---

## 5. RPO / RTO : hypothèses et mesures

### 5.1 Définitions assumées

- **RPO** (perte de données maximale acceptée) : dépend de la **fréquence de
  sauvegarde réellement installée**. Avec une sauvegarde quotidienne, le RPO est de
  24 h au pire. Aucune journalisation continue (*WAL archiving*) n'est en place :
  le RPO ne peut donc pas être inférieur à l'intervalle de sauvegarde.
- **RTO** (durée maximale d'interruption acceptée) : mesuré comme le temps de
  **restauration technique** (création de la base + `pg_restore` + extraction du
  volume). Le RTO réel d'un incident est plus long : il inclut la détection, la
  décision humaine, la bascule et la reprise de service.

### 5.2 Ce qui a été mesuré, et où

La durée de restauration est mesurée à chaque exécution de
`tests/api-e2e/ops-scripts.e2e.test.ts` et publiée dans les annotations du job CI
sous `RTO-MESURÉ`. Valeurs de référence et conditions : voir
`docs/DEPLOYMENT-ARCHITECTURE.md` §« Sauvegarde et restauration ».

### 5.3 Ce que ces mesures ne valent pas

Elles portent sur une base de **test** de quelques mégaoctets, sur le disque local
d'un exécuteur CI, sans concurrence, sans réseau entre base et sauvegarde, et sans
les données réelles. Le RTO d'une base de production sera **supérieur**, et
l'extrapolation linéaire n'est pas légitime. La première journée du pilote doit
inclure un exercice de restauration sur l'environnement réel, dont les durées
remplacent les valeurs ci-dessus.

---

## 6. Purger les preuves (rétention des pièces justificatives)

```bash
# Simulation — par défaut, rien n'est supprimé
node ops/prune-proofs.mjs --before=2026-01-01

# Exécution réelle — exige une date limite ET une confirmation explicite
node ops/prune-proofs.mjs --before=2026-01-01 --confirm
```

Trois garanties, toutes testées :

1. **Aucune durée par défaut.** La date limite est obligatoire. Une durée de
   conservation est une décision métier et juridique : la coder en dur reviendrait à
   la prendre à la place du client, sur un sujet où une erreur ne se rattrape pas.
2. **Rien n'est supprimé sans `--confirm`.** Le mode par défaut décrit ce qui serait
   supprimé, et s'arrête.
3. **Seules les preuves déjà supprimées logiquement** (`deletedAt` non nul) **et**
   antérieures à la date limite sont purgées. Une preuve active reste, quelle que
   soit son ancienneté : elle peut encore servir de pièce justificative.

Le script **ne touche jamais** aux lignes de `proof_files` : le journal d'audit et
les références restent lisibles, seul le fichier disparaît. Un téléchargement d'une
preuve purgée échoue alors en `410 Gone`, ce qui est le comportement attendu et non
une panne.

La politique de rétention (durées, responsables, validations) est décrite dans
`docs/SECURITY-MODEL.md` §« Rétention des preuves de livraison ».

---

## 7. Responsabilités et décisions humaines

Aucun nom n'est inventé ici : ces rôles doivent être **désignés** avant le pilote.

| Responsabilité | Désignation | Décision en attente |
| --- | --- | --- |
| Réception des alertes de disponibilité | à désigner | qui reçoit, sur quel canal |
| Réception des alertes de sauvegarde | à désigner | canal, et qui relance une sauvegarde en échec |
| Décision de restauration d'incident | à désigner | qui a l'autorité d'arrêter l'API et de restaurer |
| Conservation des preuves | à désigner | durée par nature de preuve, voir `SECURITY-MODEL.md` |
| Exercice de restauration | à désigner | fréquence (proposée : trimestrielle, et une fois pendant le pilote) |

---

## 8. Procédure d'incident

| Situation | Diagnostic | Action |
| --- | --- | --- |
| Sonde code 2 (`INDISPONIBLE`) | `node ops/healthcheck.mjs` | vérifier le processus, puis l'équilibreur ; redémarrer l'instance seulement si elle ne répond plus du tout |
| Sonde code 1 (`DEGRADE`) | `curl /health/ready` | lire `checks` : `database` → la base ; `storage` → le volume de preuves |
| `storage: ESPACE_INSUFFISANT` | `df -h` sur `PROOF_STORAGE_DIR` | libérer de l'espace ou étendre le volume ; ne pas baisser le seuil sans décision explicite |
| `storage: NON_INSCRIPTIBLE` | droits et montage du volume | corriger le montage ; l'instance est hors routage tant que ce n'est pas résolu |
| Sauvegarde en échec | `status.json`, journal de l'ordonnanceur | corriger la cause **puis relancer immédiatement** ; ne pas attendre le lendemain |
| Preuve introuvable (`410`) | empreinte + `storageKey` en base | vérifier le volume ; si le fichier est perdu, la sauvegarde est le seul recours — et la preuve est définitivement manquante si elle est antérieure à la première sauvegarde |
| Suspicion d'altération de sauvegarde | `ops/backup.mjs` relit ce qu'il écrit ; `verifyBackupIntegrity` | considérer la sauvegarde comme perdue, ne pas restaurer dessus |

---

## 9. Parcours pilote — recette terrain

### 9.1 Décision : une expérience hors ligne installable est-elle nécessaire ?

**État réel, sans arrondi.** La file d'attente hors ligne
(`lib/jotoliko-os/offline-queue.ts`) est de la **logique seule** : états
`EN_ATTENTE` → `SYNCHRONISATION` → `SYNCHRONISE` / `ECHEC`, clé d'idempotence
`clientId`, temporisation croissante de 2 s à 5 min. Il n'existe **aucun service
worker et aucun manifeste** : l'application n'est ni installable, ni mise en cache
par le navigateur. Sans réseau, l'interface ne se charge pas. Cette file n'est donc
**pas une PWA**, et ne doit pas être présentée comme telle.

**Décision — ne pas construire de PWA avant le pilote.** Trois raisons :

1. l'objet du pilote est de vérifier le parcours métier de bout en bout (mission,
   livraison, preuve, encaissement déclaré, rapprochement, incident), pas la
   couverture réseau ;
2. une PWA utile n'est pas un réglage mais un chantier : service worker, stratégie
   de cache de l'interface, stockage local indexé, file de reprise, indicateur
   d'état hors ligne, et surtout **résolution des conflits** lorsqu'un même
   document a été modifié des deux côtés. Le livrer à moitié serait pire que
   l'absence : le livreur croirait pouvoir travailler sans réseau ;
3. l'idempotence serveur existe déjà (`clientId` sur les preuves, `Idempotency-Key`
   sur les mutations). La couche manquante est côté navigateur, et peut être ajoutée
   **sans changer le contrat d'API**.

**Contrainte à accepter explicitement si cette décision est maintenue :** en
l'absence de réseau, **le dépôt d'une preuve et la clôture d'une livraison sont
impossibles**. Le pilote doit donc se dérouler sur des zones couvertes, ou accepter
une saisie différée hors application (papier, appel). C'est une décision du client,
pas une caractéristique du logiciel.

Éléments nécessaires pour revenir sur cette décision : manifeste et icônes, service
worker avec stratégie de cache explicite, stockage local durable, file de reprise
persistante, indicateur d'état hors ligne visible, test de coupure réseau dans la
recette. Aucune estimation de charge n'est avancée ici : elle n'a pas été mesurée.

### 9.2 Encaissements : déclaré n'est pas confirmé

**Aucun fournisseur de paiement n'est configuré ni testé.** Le modèle `Payment`
existe dans le schéma, mais `prisma.payment` n'est appelé par **aucune** route de
l'API : les encaissements passent par `POST /missions/:id/payment` et
`POST /missions/:id/remittance`, qui enregistrent des **déclarations
d'exploitation** et des mouvements de caisse.

Conséquence pour la recette : tout encaissement constaté pendant le pilote est un
**montant déclaré par le livreur**, jamais un paiement confirmé par un opérateur
mobile money ou une banque. La fiche de recette doit porter la mention « déclaré »
et la personne qui l'a déclaré ; écrire « confirmé » ou « encaissé » sans
justificatif de l'opérateur serait une affirmation non vérifiable.

### 9.3 Checklist de recette

À exécuter sur un environnement dédié, jamais sur des données réelles. Chaque ligne
se consigne avec l'heure, l'acteur et le résultat observé — une case cochée sans
trace ne vaut pas comme preuve.

| # | Scénario | Attendu | Ce qui doit être consigné |
| --- | --- | --- | --- |
| 1 | Création de mission | Mission créée, référence unique | Référence, identifiant |
| 2 | **Doublon** : même requête rejouée avec la même `Idempotency-Key` | **Une seule** mission créée | Nombre d'enregistrements en base |
| 3 | Attribution à un livreur | `assignedUserId` renseigné, statut cohérent | Identifiant du livreur |
| 4 | **Autorisation** : livreur non affecté tentant une transition | Refus `403`, aucune écriture | Code HTTP, absence de modification |
| 5 | Livraison : clôture **sans** preuve alors que la politique l'exige | Refus explicite | Code HTTP et message |
| 6 | Dépôt de preuve | Fichier écrit, empreinte enregistrée | Empreinte SHA-256, chemin, taille |
| 7 | **Doublon de preuve** : même contenu redéposé | **Aucun** second fichier, même référence | Nombre de fichiers sur le volume |
| 8 | Téléchargement de la preuve | Contenu identique, `Content-Disposition: attachment` | Taille téléchargée, empreinte recalculée |
| 9 | **Interruption réseau** en cours de dépôt | Aucun fichier partiel, aucun enregistrement orphelin | État du volume et de la base |
| 10 | **Reprise** après coupure avec le même `clientId` | Dépôt rejoué sans doublon | Nombre de preuves |
| 11 | Encaissement **déclaré** | Montant enregistré, statut `COLLECTED` | Montant, déclarant, horodatage |
| 12 | Plafond d'encaissement dépassé | Refus (déclaré > attendu) | Code HTTP |
| 13 | Versement au bureau (`remittance`) | Mouvement de caisse symétrique | Montants déclaré / remis / écart |
| 14 | **Rapprochement** attendu − déclaré − remis | Écart calculé et affiché, jamais masqué | Valeur de l'écart, signe |
| 15 | Accès d'une autre entreprise à une mission | Refus `404`/`403`, aucune fuite | Code HTTP, corps |
| 16 | Jeton expiré ou révoqué | Refus `401` | Code HTTP |
| 17 | Base indisponible (arrêt contrôlé) | `/health/ready` → `503`, l'API ne prétend pas être prête | Code et corps de la sonde |
| 18 | Volume de preuves plein | `storage: ESPACE_INSUFFISANT`, instance hors routage | Code et corps de la sonde |
| 19 | Preuve supprimée logiquement puis téléchargée | `410 Gone` | Code HTTP |
| 20 | Incident : redémarrage de l'API pendant une session | Session reprise ou reconnexion exigée, aucune écriture perdue | Comportement observé |

Les scénarios 2, 7, 9, 10 et 19 vérifient la reprise et les doublons : ce sont ceux
qui se dégradent le plus vite en conditions réelles (réseau instable, rejeu,
suppression), et ils ne se testent pas depuis un poste de travail confortablement
connecté — d'où l'exécution **sur le terrain**, avec le matériel des livreurs.

---

## 10. Décisions qui bloquent le pilote

1. **Provisionner un environnement de staging** (hébergeur, coût, secrets) —
   aucune dépense ne sera engagée sans autorisation explicite.
2. **Installer la planification des sauvegardes** sur cet environnement, avec un
   destinataire d'alerte réel.
3. **Désigner les responsables** du tableau §7.
4. **Valider la politique de rétention des preuves** (§6 et `SECURITY-MODEL.md`).
5. **Valider la décision hors ligne** (§9.1) : elle est proposée, argumentée, et
   engage le déroulement du pilote — cf. §9.2 sur la distinction
   déclaré / confirmé.
