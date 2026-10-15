# Alertes et sauvegardes — procédure sans abonnement

## Alertes gratuites sur téléphone avec ntfy

Les scripts `ops/healthcheck.mjs` et `ops/backup.mjs` peuvent envoyer des notifications push avec ntfy si `JOTOLIKO_NTFY_URL` est défini. Pour les sauvegardes, `BACKUP_NTFY_URL` permet une URL distincte et prioritaire.

**Attention à la confidentialité :** un sujet public ntfy n'est pas un coffre privé. Le nom du sujet fonctionne comme un secret de type lien de partage. Générer un nom long et aléatoire, ne jamais le publier, ne pas inclure de données clients dans les messages et, si la confidentialité stricte est requise, héberger son propre relais ou choisir un canal authentifié.

1. Installer l'application ntfy sur le téléphone ou utiliser son site officiel.
2. Choisir un sujet aléatoire long (ne pas utiliser `jotoliko`, le nom de l'entreprise ou une référence prévisible).
3. S'abonner à ce sujet sur le téléphone et conserver l'URL du sujet dans le gestionnaire de secrets du serveur.
4. Définir `JOTOLIKO_NTFY_URL` dans l'environnement du serveur. Ne jamais l'inscrire dans le dépôt, dans `NEXT_PUBLIC_*`, dans un ticket ou dans un journal.
5. Pour tester sans exposer le sujet, envoyer une notification de test depuis le serveur avec un outil local approuvé, puis confirmer sa réception sur le téléphone.
6. Le healthcheck envoie une alerte sur incident, applique un délai anti-répétition par défaut de 30 minutes et envoie une notification de rétablissement quand il détecte le retour à l'état normal.

Si l'URL de notification est absente, les scripts restent utilisables, mais aucune notification push n'est envoyée. Le code de sortie reste la source de vérité pour l'ordonnanceur.

## Planification du healthcheck

Exécuter `node ops/healthcheck.mjs` toutes les 5 minutes depuis le serveur ou un ordonnanceur indépendant, avec :

- `API_BASE_URL=https://api.votre-domaine.example`
- `JOTOLIKO_NTFY_URL` dans l'environnement protégé
- `HEALTHCHECK_ALERT_STATE_FILE=/var/lib/jotoliko/healthcheck-alert-state.json` (répertoire persistant et accessible au compte de service)
- `HEALTHCHECK_ALERT_COOLDOWN_MS=1800000` (30 minutes)

Codes de sortie : 0 disponible, 1 dégradé (base ou stockage), 2 injoignable. Un échec de livraison de notification est écrit dans le journal, mais ne masque pas le code de santé.

## Sauvegarde

Le script `ops/backup.mjs` sauvegarde ensemble :
- la base PostgreSQL ;
- le volume `PROOF_STORAGE_DIR` ;
- le manifeste, les empreintes et l'état de vérification.

Variables principales :

- `DATABASE_URL` : base PostgreSQL ;
- `PROOF_STORAGE_DIR` : volume persistant des preuves ;
- `BACKUP_DIR` : destination locale de travail ;
- `BACKUP_ENCRYPTION=openssl-aes256` et `BACKUP_ENCRYPTION_KEY_FILE` : chiffrement au repos ;
- `BACKUP_NTFY_URL` ou `JOTOLIKO_NTFY_URL` : alerte en cas d'échec ;
- `BACKUP_KEEP_DAILY` et `BACKUP_KEEP_WEEKLY` : rétention selon la politique approuvée.

La destination locale `BACKUP_DIR` n'est pas une copie indépendante si elle se trouve sur le même serveur. Avant le pilote, envoyer les artefacts chiffrés vers un autre fournisseur ou un autre site, et conserver la clé de chiffrement séparément des archives.

Exécution de pré-vol sans écriture réelle :

```bash
node ops/backup.mjs --dry-run
```

Exécution réelle uniquement après validation des variables, des chemins, de la clé et de la destination :

```bash
node ops/backup.mjs
```

Après une sauvegarde, vérifier le manifeste et lancer une restauration isolée avec `ops/restore-verify.mjs`. La restauration doit vérifier que chaque fichier de preuve référencé existe et que son SHA-256 correspond. Ne jamais restaurer sur la base active pour faire un test.

## Fréquence et responsabilités à valider

- Healthcheck : toutes les 5 minutes.
- Sauvegarde : quotidienne, plus avant toute migration ou mise à jour risquée.
- Restauration de contrôle : mensuelle et après modification du format de sauvegarde.
- Rétention : à approuver avant production; ne pas inventer une durée légale ou contractuelle.
- La procédure n'est pas active tant qu'un serveur, un ordonnanceur, une destination hors site et un destinataire d'alerte n'ont pas été configurés et testés.
