# Modèle de sécurité — état réel

Ce document décrit ce qui est **effectivement implémenté et vérifié**, et signale
explicitement ce qui ne l'est pas. Une protection décrite mais absente est plus
dangereuse qu'une protection absente : elle fait relâcher la vigilance.

Chaque affirmation ci-dessous renvoie à un test exécutable. Les vérifications
marquées ✔ sont exécutées automatiquement (voir `tests/unit/proof-storage.test.ts`,
`tests/api-e2e/*.e2e.test.ts`, `scripts/api-offline-smoke.mjs`).

## 1. Authentification

- **Aucune authentification côté navigateur uniquement.** Le rôle n'est jamais lu
  depuis la requête : il est relu en base via `Membership → Role` à chaque appel.
- Jeton : `v1.<charge base64url>.<horodatage d'émission>.<HMAC-SHA-256>`. La
  signature couvre la version, la charge utile **et** l'horodatage : modifier l'un
  des trois invalide le jeton. Durée de vie 8 h, tolérance d'horloge 60 s.
- Refus explicites, jamais de message distinguant les cas pour l'appelant :
  `TOKEN_EXPIRE`, `MALFORME`, `SIGNATURE_INVALIDE`, `HORODATAGE_INVALIDE`,
  `JETON_DANS_LE_FUTUR`, `CHARGE_INVALIDE`, `VERSION_INCONNUE`.
- Le jeton est une **prétention** : à chaque requête, le serveur vérifie que le
  compte est actif, que la `tokenVersion` n'a pas été incrémentée et que le rôle
  porté correspond au rôle réel. Désactiver un compte ou retirer un rôle invalide
  instantanément les jetons en circulation.
- ✔ Vérifié : jeton absent, non signé, expiré, daté dans le futur, signé avec un
  autre secret, à charge utile altérée — tous refusés en `401`.
- `POST /auth/login` renvoie un message **unique** (« Identifiants invalides »)
  pour entreprise inexistante, compte inexistant, compte inactif, mauvais mot de
  passe : aucune énumération de comptes n'est possible.

**Variable requise :** `AUTH_SECRET`, 32 caractères minimum. En production, une
valeur d'exemple connue empêche le démarrage.

## 2. Cloisonnement entre entreprises

- Toute ressource métier est filtrée par `companyId` **dans la requête SQL**, pas
  après coup en mémoire.
- Une ressource d'une autre entreprise renvoie `404`, jamais `403` : l'existence
  même de la ressource n'est pas divulguée.
- ✔ Vérifié : lecture et écriture croisées entre deux entreprises ; une mise à jour
  portant sur `companyId = A` depuis le périmètre B affecte **0 ligne**.

## 3. Autorisations

- RBAC appliqué côté API (`AuthGuard` + `RolesGuard`), jamais uniquement dans
  l'interface. Un rôle insuffisant renvoie `403`.
- Un `DRIVER` n'agit que sur les missions qui lui sont affectées ; la violation de
  périmètre renvoie `403` (et non `500`, défaut corrigé et désormais testé).
- Permissions par opération : `createMission`, `assignMission`, `transitionMission`,
  `recordGps`, `collectCash`, `remitCash`, `uploadProof`, `readProof`,
  `deleteProof`, `readAudit`.

## 4. Validation des entrées

- `ValidationPipe` avec `whitelist`, `forbidNonWhitelisted` et
  `forbidUnknownValues` : une propriété non déclarée est **rejetée** (`400`), pas
  ignorée silencieusement.
- Corps JSON borné et calculé depuis la taille maximale de preuve
  (`ceil(5 Mio × 4 / 3) + 64 Kio`) : ni la limite par défaut (100 ko, qui refuserait
  toute photo), ni une valeur arbitrairement large.
- ✔ Vérifié : corps illisible → `400` (et non `500`), charge utile hors limite →
  `413`, propriété non déclarée → `400`.

## 5. Secrets et divulgation

- Aucun secret dans le frontend ; le site public ne connaît que
  `NEXT_PUBLIC_SITE_URL` et `NEXT_PUBLIC_BASE_PATH`.
- La configuration effective est journalisée au démarrage **sans le secret** :
  seule sa longueur apparaît (`describeConfig`).
- Le filtre d'exception global ne laisse jamais fuir une trace d'exécution ni un
  message du moteur de base : toute erreur non métier devient un `500` muet, la
  cause partant dans les journaux serveur avec l'identifiant de corrélation.
- ✔ Vérifié : aucune réponse HTTP ne contient `AUTH_SECRET`.
- **Variables d'environnement :** `.env.example` ne liste que des variables
  réellement lues par le code. Les variables d'une intégration non développée
  (`JWT_SECRET`, `S3_*`, `REDIS_URL`) en ont été retirées, précisément pour éviter
  qu'un déploiement croie les avoir configurées.

## 6. Limitation de débit

- 120 requêtes/minute par défaut, 5/minute sur `POST /auth/login`, 30/minute sur
  les mutations financières, 20/minute sur les dépôts de preuve.
- L'adresse retenue dépend de `TRUST_PROXY_HOPS`, et ce réglage est **une décision
  de sécurité** :
  - `0` (défaut) : `X-Forwarded-For` est **ignoré**. Un client direct ne peut pas
    falsifier son adresse pour obtenir un quota neuf.
  - `> 0` : l'en-tête est honoré (derrière un répartiteur de charge), sinon tous
    les utilisateurs partageraient le quota d'une seule adresse.
- ✔ Vérifié dans les deux configurations, contre l'API réellement démarrée :
  cinq adresses annoncées différentes ne contournent pas la limite quand aucun
  proxy n'est déclaré ; une autre adresse réelle derrière un proxy déclaré
  n'hérite pas du quota de la précédente.

## 7. CORS, journaux et corrélation

- `CORS_ORIGIN` doit lister explicitement les origines autorisées. Aucun repli
  permissif : sans valeur, le serveur refuse de démarrer. `*` est refusé en
  production. En-têtes autorisés : `Content-Type`, `Authorization`,
  `Idempotency-Key`, `X-Request-Id`.
- ✔ Vérifié : origine autorisée → en-tête présent ; origine inconnue → aucun
  en-tête `Access-Control-Allow-Origin` ; préflight → `204`.
- Chaque réponse porte un identifiant de corrélation, y compris une requête
  rejetée par l'analyseur de corps (l'identifiant est posé **avant** l'analyse).
  Un `X-Request-Id` fourni par l'appelant est conservé s'il respecte
  `^[\w.:-]{8,128}$`.
- En-têtes de durcissement : `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`.
- **Aucune donnée sensible dans les journaux** : ni mot de passe, ni jeton, ni
  contenu de preuve, ni coordonnée GPS en clair. Les journaux portent l'action,
  l'identifiant de corrélation et les identifiants techniques.

## 8. Idempotence et concurrence

- `Idempotency-Key` **obligatoire** sur `POST /missions/:id/payment` et
  `POST /missions/:id/remittance` (8 caractères minimum). Une clé réutilisée avec
  un contenu différent est un conflit (`409`) ; rejouée à l'identique, elle
  renvoie le résultat initial.
- Création de mission idempotente par `(opération, référence)` : un rejeu ne crée
  pas de doublon.
- Affectation par comparaison-et-permutation (`UPDATE … WHERE assignedUserId IS NOT
  DISTINCT FROM …`) : une affectation concurrente ne peut pas écraser la première,
  elle renvoie `409`.
- Les mutations financières s'exécutent en transaction : un encaissement
  concurrent est refusé (`400` ou `409` selon la règle déclenchée), et l'invariant
  « un seul encaissement par mission » est vérifié en base.

## 9. Audit

- Une **seule** table d'audit (`audit_logs`) couvre toutes les mutations sensibles :
  action, type et identifiant d'entité, état avant/après, identifiant de
  corrélation, source, acteur.
- Actions tracées : `MISSION_CREATED`, `MISSION_ASSIGNED`, `MISSION_TRANSITION`,
  `CASH_COLLECTED`, `CASH_REMITTED`, `GPS_RECORDED`, `PROOF_UPLOADED`,
  `PROOF_DELETED`.
- ✔ Vérifié : chaque mutation testée laisse exactement une ligne d'audit
  correspondante.

## 10. Preuves de livraison

Une preuve de livraison contient une adresse, une signature et parfois un visage :
elle n'est jamais servie sans contrôle du périmètre.

**Stockage.** Répertoire dédié (`PROOF_STORAGE_DIR`), **jamais** de stockage
base64 en base et jamais d'URL publique. Clé de stockage **déterministe** :
`<companyId>/<missionId>/<sha256>.<extension>`. Elle est composée par le serveur à
partir d'identifiants et d'une empreinte, jamais d'un nom de fichier fourni par le
client.

**Contrôles avant écriture**, dans cet ordre :
1. permission (`uploadProof`) et périmètre de la mission ;
2. type déclaré dans la liste blanche (`image/jpeg`, `image/png`, `image/webp`,
   `application/pdf`) ;
3. décodage base64 strict, contenu non vide, taille ≤ 5 Mio ;
4. **signature binaire** du contenu comparée au type déclaré — un exécutable
   renommé en `.jpg` est refusé (`415`).

**Écriture.** Atomique : fichier temporaire puis renommage, permissions `0600`. Un
téléversement interrompu ne laisse jamais un fichier partiel servi comme une preuve
valide. Le fichier est écrit **avant** la ligne en base : une interruption laisse au
pire un fichier orphelin, jamais une preuve annoncée sans contenu.

**Anti-traversée.** Chaque segment de clé est validé (`[A-Za-z0-9][A-Za-z0-9._-]*`,
longueur maximale 69 — l'empreinte SHA-256 fait 64 caractères, l'extension jusqu'à
4) et le chemin résolu doit rester à l'intérieur du répertoire de preuves. Un
segment commençant par `.` est refusé, ce qui exclut `..`.

> **Défaut corrigé, à retenir.** Cette validation bornait initialement un segment à
> 64 caractères : la clé réellement composée en fait 68 à 69, si bien que **tout**
> dépôt de preuve échouait en `500` (converti en erreur interne muette). Le défaut
> a été trouvé par la suite HTTP en CI, pas par les tests unitaires — aucun test ne
> composait la clé réelle avant de la valider. `tests/unit/proof-storage.test.ts`
> verrouille désormais cet accord.

**Suppression.** Logique (`deletedAt`) : la ligne reste auditable, l'opération est
tracée (`PROOF_DELETED`), et la preuve disparaît des listes et des téléchargements.

### Rétention

- **Aucune purge automatique n'est implémentée.** Le fichier reste sur le disque
  après suppression logique : la purge physique est une opération d'exploitation
  explicite, jamais un effet de bord.
- Durée de conservation recommandée à ce stade : **la durée contractuelle de
  conservation des pièces justificatives de livraison** (à fixer avec le client
  pilote). Tant qu'elle n'est pas fixée, aucune purge ne doit être planifiée.
- Procédure de purge à prévoir avant mise en production : identifier les lignes
  `deletedAt IS NOT NULL` plus anciennes que la durée retenue, supprimer les
  fichiers correspondants, conserver la ligne d'audit `PROOF_DELETED`. La
  suppression doit être **idempotente** (un fichier déjà absent n'est pas une
  erreur).
- Un fichier orphelin (présent sur le disque sans ligne en base) est récupérable
  par une tâche de réconciliation ; il ne doit jamais être servi, la lecture
  passant toujours par la base.

### Sauvegarde

- Les preuves vivent **hors** de la base : sauvegarder PostgreSQL seul conserve les
  références et les empreintes, **pas les fichiers**. Une restauration serait alors
  cohérente en base et vide sur le disque, ce qui produirait des `410` en série.
- La sauvegarde doit donc couvrir **les deux** : `pg_dump` de la base **et** copie
  du volume `PROOF_STORAGE_DIR`. Les deux doivent être prises au même moment (ou
  dans un ordre tel qu'aucune preuve référencée ne manque).
- ✔ Vérifié en CI : `pg_dump --format=custom` puis `pg_restore` dans une base
  **isolée**, avec contrôle des données, des contraintes, des relations, de la
  ligne de preuve, de la caisse et de l'audit. La restauration sur données
  existantes n'est jamais exécutée sans autorisation explicite.

## 11. Ce qui n'est pas protégé / pas implémenté

À connaître avant un pilote, sans extrapolation :

- **Chiffrement au repos** : aucune. Les preuves sont en clair sur le disque, la
  base aussi. Le chiffrement relève du volume de stockage (disque chiffré du
  fournisseur) et doit être vérifié à ce niveau.
- **Rotation de `AUTH_SECRET`** : non outillée. La rotation invalide tous les
  jetons ; elle exige une fenêtre de reconnexion. Incrémenter `tokenVersion`
  invalide un utilisateur précis, mais aucune interface d'administration n'existe
  pour le faire.
- **WAF, protection anti-DDoS, liste noire d'IP** : absents (relèvent de
  l'hébergement).
- **Paiement mobile money : non intégré.** Les encaissements sont des déclarations
  d'exploitation. Aucun fournisseur n'est configuré ni testé : ne pas annoncer une
  intégration de paiement.
- **Notifications : non implémentées.** Aucun canal (SMS, WhatsApp, e-mail) n'est
  configuré ; rien n'est annoncé comme envoyé.
- **Stockage objet / URL signée** : non implémenté. Le choix actuel (répertoire
  serveur) est cohérent pour un pilote mono-serveur, mais un déploiement
  multi-instances exigerait un volume partagé ou un stockage objet.
- **Journal d'audit** : écrit, non exposé en lecture par l'API. La consultation se
  fait en base.
- **Mots de passe** : dérivés par `scrypt` avec sel par utilisateur. Pas de
  politique de complexité, pas de réinitialisation, pas de seconde authentification.
