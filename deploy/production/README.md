# Jotoliko — déploiement séparé pour staging

Cette configuration est préparatoire. Elle ne crée aucun serveur, ne réserve aucun domaine et ne publie rien. Elle est séparée du `docker-compose.yml` de développement, qui contient des identifiants de démonstration et ne doit pas être utilisé en production.

## Ce que cette topologie protège

- PostgreSQL n'a aucun port publié sur Internet.
- Le volume de preuves est un chemin persistant sur l'hôte.
- L'API est derrière Caddy; le trafic public passe par HTTP/HTTPS.
- Le réseau de données est interne; Caddy n'a pas accès au réseau PostgreSQL.
- Les secrets viennent d'un fichier local non versionné.
- Les migrations ne s'exécutent pas lors d'un simple `up`; elles nécessitent une commande explicite.
- Le conteneur API utilise un utilisateur non-root et des contrôles de santé.

## Prérequis

Un serveur Linux avec Docker Engine + le plugin Docker Compose, DNS du domaine API pointant vers ce serveur, ports 80/443 disponibles et une adresse e-mail de contact chez le fournisseur du domaine. Avant toute création de serveur, confirmer le coût annuel total et l'autorisation de dépense.

## Préparer la configuration

1. Sur le serveur, copier ce modèle vers un fichier local `.env.production`. Ne jamais versionner ce fichier :
   `cp deploy/production/.env.production.example deploy/production/.env.production`
2. Remplacer tous les placeholders. Générer un mot de passe PostgreSQL URL-safe avec `openssl rand -hex 32` et un secret API distinct avec `openssl rand -base64 48`.
3. Régler `API_DOMAIN` sur un véritable domaine ou sous-domaine, et `CORS_ORIGIN` sur l'origine exacte du frontend (pas l'URL de l'API).
4. Créer le répertoire persistant de preuves et donner la propriété à l'UID/GID du conteneur :
   `sudo install -d -o 1000 -g 1000 -m 750 /srv/jotoliko/proofs`
5. Vérifier la syntaxe sans afficher la configuration secrète :
   `docker compose --env-file deploy/production/.env.production -f deploy/production/compose.yaml config --quiet`

## Première mise en route — staging uniquement

À exécuter uniquement après que le serveur et les accès aient été approuvés et préparés.

1. Démarrer PostgreSQL : `docker compose --env-file deploy/production/.env.production -f deploy/production/compose.yaml up -d postgres`
2. Pour une base neuve de staging, appliquer les migrations explicitement :
   `docker compose --env-file deploy/production/.env.production -f deploy/production/compose.yaml --profile maintenance run --rm migrate`
3. Construire et démarrer l'API et le proxy HTTPS :
   `docker compose --env-file deploy/production/.env.production -f deploy/production/compose.yaml up -d --build api caddy`
4. Vérifier `https://API_DOMAIN/health/live` et `https://API_DOMAIN/health/ready`. La deuxième sonde doit retourner `200` avec `status: ready`.
5. Vérifier les journaux et effectuer les tests API de staging avec des données fictives seulement.

**Migration sur une base qui contient déjà des données :** arrêter ici. Faire et vérifier une sauvegarde de la base ET du volume de preuves avant toute migration; confirmer l'impact du diff de migration; obtenir l'autorisation explicite. Ne jamais exécuter `migrate dev` sur un environnement partagé.

## Sauvegardes — condition non satisfaite par cette configuration seule

Le compose n'invente pas de destination indépendante. Avant tout pilote opérationnel, configurer `ops/backup.mjs` avec une destination chiffrée hors serveur, planifier la sauvegarde de la base et du volume de preuves, brancher une alerte vers un destinataire réel, puis restaurer en staging avec `ops/restore-verify.mjs`. Une copie située sur le même serveur n'est pas indépendante.

## Limite produit connue

L'interface de suivi contient encore des données de démonstration et son intégration à l'API doit être auditée et terminée. Déployer l'API seule ne transforme pas la démo en opérations réelles. Garder le bandeau « Mode démonstration » tant que l'intégration et les tests n'ont pas prouvé le contraire.

## Retour arrière

Conserver l'image API précédente et une sauvegarde vérifiée avant toute mise à jour. Un rollback de code ne remplace pas une restauration de base, et les migrations additives doivent être évaluées avant retour arrière. Cette procédure n'a pas encore été éprouvée sur un serveur réel.
