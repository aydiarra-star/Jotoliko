# Intégration des abonnements au schéma Prisma canonique

## Résultat de l'audit

Le schéma canonique est `prisma/schema.prisma` (pas `apps/api/prisma/schema.prisma`). Il définit PostgreSQL et génère le client utilisé par l'API NestJS. Les modèles métier existants incluent `Company`, `User`, `Membership` et `Driver`.

Constats vérifiés sur la branche de référence `arena/dd76021f-jotoliko` :

- `Company` possède déjà `country`, `currency` et `timezone`, avec des valeurs par défaut Sénégal / XOF / Africa-Dakar.
- `User` possède `passwordHash`, `passwordSalt`, `tokenVersion` et `isActive`. L'authentification actuelle refuse les utilisateurs inactifs.
- `Membership` relie un utilisateur à une entreprise et un rôle, avec une contrainte unique `[userId, companyId]`.
- `Role.code` est unique ; le rôle d'administration attendu pour une inscription d'entreprise est `OWNER`, mais il faut vérifier qu'il est provisionné dans les données de référence.
- `Driver` est une entité opérationnelle distincte de `User`. La limite d'abonnement doit compter les livreurs actifs de l'entreprise, pas le nombre de comptes utilisateurs.
- `Payment` est déjà utilisé pour les encaissements de commandes/livraisons. Il ne faut **pas** le réutiliser pour les paiements d'abonnement.
- `AppModule` importe actuellement Auth, Missions, Proofs et Prisma ; aucun module Billing n'est encore enregistré.
- Les scripts Prisma de l'API pointent vers `../../prisma/schema.prisma`.

## Modèles à ajouter (proposition, pas encore une migration)

Les noms et champs ci-dessous sont une cible d'implémentation ; ils ne doivent pas être considérés comme déjà présents en base.

### `PlanPrice` — tarif versionné

- `id`, `code`, `version`, `currency` (XOF), `unitPriceXof`, `effectiveFrom`, `effectiveUntil`, `createdAt`
- Contrainte unique sur `[code, version]`.
- Aucun tarif par défaut : tant qu'un prix n'est pas approuvé et configuré, le checkout doit échouer proprement sans activer de compte payant.

### `Subscription` — abonnement d'une entreprise

- `id`, `companyId`, `planPriceId`, `seatLimit`, `status`, `currentPeriodStart`, `currentPeriodEnd`, `gracePeriodEndsAt`, `cancelAtPeriodEnd`, `provider`, `providerCustomerRef`, `providerSubscriptionRef`, `createdAt`, `updatedAt`
- Relation à `Company` avec index sur `[companyId, status]`.
- Les états doivent être une enum Prisma partagée avec les gardes d'accès ; éviter des chaînes libres.

### `BillingPayment` — journal séparé des paiements d'abonnement

- `id`, `subscriptionId`, `provider`, `providerReference`, `amountXof`, `currency`, `status`, `idempotencyKey`, `paidAt`, `rawEventHash`, `createdAt`
- Référence fournisseur unique lorsque présente, clé d'idempotence unique et index par abonnement.
- Ne jamais stocker de numéro de carte, code PIN, secret de portefeuille ou identifiant de paiement sensible dans le journal.

### `SignupAttempt` — inscription en attente

- `id`, `companyName`, `companySlug`, `ownerEmail`, `ownerFirstName`, `ownerLastName`, `passwordHash`, `passwordSalt`, `seatCount`, `planPriceId`, `status`, `expiresAt`, `createdAt`, `updatedAt`
- Email normalisé et slug validés côté serveur ; unicité/expiration gérées avec des contraintes et transactions.
- Ne pas créer d'entreprise avec accès opérationnel tant que le paiement n'est pas confirmé par le serveur.
- La politique de conservation des inscriptions abandonnées reste à définir avant d'activer la collecte réelle de données.

## Ordre d'implémentation sécurisé

1. Décider et documenter la règle de comptage : un siège = un `Driver.isActive` par entreprise. Le dépassement doit être refusé côté API, dans une transaction, y compris en cas de requêtes concurrentes.
2. Approuver le tarif en FCFA par livreur/mois et sa version. Aucun prix illustratif ne doit devenir un tarif réel implicitement.
3. Ajouter les modèles et les relations dans le schéma canonique, puis créer une migration SQL explicite. Ne pas exécuter `migrate deploy` sur un environnement partagé dans cette étape.
4. Valider le schéma, générer Prisma Client et tester la migration sur une base locale jetable ; vérifier également que le dépôt utilise bien des migrations versionnées et que la migration est compatible avec son historique réel.
5. Ajouter le module Billing NestJS et l'inscription transactionnelle. L'activation crée l'entreprise, le propriétaire et l'appartenance `OWNER` dans une transaction uniquement après confirmation vérifiée du paiement.
6. Ajouter la vérification fournisseur côté serveur, l'idempotence des callbacks, le rapprochement montant/devise/référence, puis les tests d'échec, de doublon et de callbacks désordonnés.
7. Brancher les gardes d'accès sur l'état d'abonnement sans supprimer les données à l'expiration. Tester l'isolation entre entreprises et le cas où plusieurs requêtes tentent de dépasser la limite en même temps.

## Statut

Audit du schéma effectué ; aucune modification de schéma ou migration de base n'est incluse dans cette étape. Aucun tarif, compte marchand, paiement, déploiement ou merge n'a été créé. Ce document prépare l'intégration mais ne prétend pas que l'inscription ou la facturation sont déjà fonctionnelles.
