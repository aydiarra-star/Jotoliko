# Comptes fictifs — staging isolé

## Statut

Cette procédure est réservée à une base PostgreSQL distincte et jetable de staging. Elle ne provisionne aucun hébergement, ne crée aucun compte réel et ne déploie rien. Elle ne doit jamais être exécutée contre la production.

Le script `apps/api/scripts/test-accounts.mjs` :
- refuse `NODE_ENV=production` ;
- exige `JOTOLIKO_ACCOUNT_ENV=isolated-staging` ;
- exige que le nom de base dans `DATABASE_URL` contienne `staging`, `test`, `sandbox` ou `ci` ;
- ne supprime pas de données et ne réinitialise pas les mots de passe existants ;
- génère des mots de passe aléatoires et les affiche seulement lors de la création ;
- crée une entreprise fictive `jotoliko-staging-test` ;
- crée un OWNER de test actif pour l'administration du staging, ainsi qu'un MANAGER et un DRIVER fictifs inactifs.

Les adresses utilisent le domaine réservé `.test`. Elles ne représentent pas des personnes ni des adresses e-mail réelles.

## Préconditions

1. Créer manuellement une base PostgreSQL gratuite et isolée, sans données de production.
2. Appliquer les migrations Prisma à cette base uniquement.
3. Générer le client Prisma avec `npm --prefix apps/api run prisma:generate`.
4. Définir `DATABASE_URL` vers la base isolée, `AUTH_SECRET` (32 caractères ou plus) et `JOTOLIKO_ACCOUNT_ENV=isolated-staging`.
5. Ne jamais mettre de secret dans un fichier suivi par Git ou dans une variable `NEXT_PUBLIC_*`.

## Créer les comptes fictifs

Depuis la racine du dépôt, dans un terminal local connecté uniquement à la base isolée :

```bash
JOTOLIKO_ACCOUNT_ENV=isolated-staging node apps/api/scripts/test-accounts.mjs create
```

Fournir `DATABASE_URL` dans l'environnement du terminal. Les migrations doivent déjà être appliquées. Conserver les mots de passe affichés dans un gestionnaire local sûr ; ils ne seront pas affichés de nouveau lors d'une relance. Une relance ne réinitialise ni les mots de passe ni l'état d'activation.

Identifiant d'entreprise pour la connexion : `jotoliko-staging-test`.

## Activer un compte fictif

L'activation est une action distincte, réservée à l'opérateur administrateur ayant accès au terminal du staging. Elle ne peut viser que les deux comptes fictifs MANAGER et DRIVER prévus par le script :

```bash
JOTOLIKO_ACCOUNT_ENV=isolated-staging JOTOLIKO_ACCOUNT_ADMIN_APPROVED=true \
  node apps/api/scripts/test-accounts.mjs activate manager@jotoliko.test
```

Remplacer l'e-mail par `driver@jotoliko.test` pour le livreur. Le script refuse les autres adresses, ne change pas le mot de passe et incrémente `tokenVersion` pour invalider d'éventuels jetons antérieurs.

## Limites actuelles

- Cette automatisation est un outil CLI d'amorçage/test, pas une interface d'administration publique ni un système d'invitations par e-mail.
- Le compte OWNER est un compte de test à mot de passe aléatoire, pas un compte administrateur de production.
- L'API de création d'utilisateurs, l'audit métier de cette création, les invitations à durée limitée et la définition du parcours d'activation pour de vrais clients nécessitent un chantier séparé.
- Le script n'a pas été exécuté sur une base réelle depuis cette modification. Valider d'abord avec une base de test isolée et vérifier les comptes, rôles, refus de connexion avant activation et connexion après activation.
- Aucun staging externe n'est provisionné par ce changement.
