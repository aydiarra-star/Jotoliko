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

## Historique des migrations vérifié

La branche de référence contient trois migrations SQL versionnées :

- `20261015000000_init_operational_core`
- `20261015120000_mvp_catalogue_and_delivery`
- `20261015180000_proof_delivery_storage`

Le fichier `migration_lock.toml` confirme PostgreSQL. La migration d'abonnement a été ajoutée ensuite sous `20261015200000_monthly_self_service_billing`, sans modifier les trois migrations existantes. Elle ajoute uniquement les enums et tables de facturation dédiées.

## Modèles et migration ajoutés dans cette PR

Le schéma canonique et une migration SQL additive proposent désormais les modèles ci-dessous. La validation Prisma et l'exécution de l'historique complet des migrations ont réussi sur une base PostgreSQL 16 jetable en CI. Aucune base partagée ou de production n'a été modifiée ; une revue et une autorisation restent nécessaires avant toute application sur un environnement réel.



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

1. Valider le schéma Prisma et exécuter les tests automatisés de la logique pure ; leur résultat doit être confirmé par CI.
2. Générer Prisma Client et tester la migration sur une base locale jetable ; ne pas exécuter `migrate deploy` sur un environnement partagé.
3. Décider et documenter la règle de comptage : un siège = un `Driver.isActive` par entreprise. Le dépassement doit être refusé côté API, dans une transaction, y compris en cas de requêtes concurrentes.
4. Approuver le tarif en FCFA par livreur/mois et sa version. Aucun prix illustratif ne doit devenir un tarif réel implicitement.
5. Ajouter le module Billing NestJS et l'inscription transactionnelle. L'activation crée l'entreprise, le propriétaire et l'appartenance `OWNER` dans une transaction uniquement après confirmation vérifiée du paiement.
6. Ajouter la vérification fournisseur côté serveur, l'idempotence des callbacks, le rapprochement montant/devise/référence, puis les tests d'échec, de doublon et de callbacks désordonnés.
7. Brancher les gardes d'accès sur l'état d'abonnement sans supprimer les données à l'expiration. Tester l'isolation entre entreprises et le cas où plusieurs requêtes tentent de dépasser la limite en même temps.

## Première intégration API (lecture seule)

Le module NestJS `BillingModule` est enregistré dans `AppModule` et expose trois routes :

- `GET /billing/pricing` : liste uniquement les tarifs explicitement actifs et dans leur période d'effet. Si aucun tarif n'est configuré, la réponse indique `configured: false` et `PRICE_NOT_CONFIGURED` ; aucun prix d'exemple n'est inventé.
- `GET /billing/quote?seats=N` : calcule une estimation mensuelle pour 1 à 500 livreurs, depuis les tarifs actifs côté serveur en XOF. Les valeurs absentes, non entières ou hors plage sont refusées avec `INVALID_SEAT_COUNT`. Si aucun tarif n'est configuré, aucun montant n'est inventé. Cette route est en lecture seule : elle ne collecte pas de données personnelles, ne crée ni compte, ni tentative d'inscription, ni paiement. Les routes publiques `pricing` et `quote` ont une limite dédiée de 30 requêtes par minute, en complément de la limite globale de l'API.
- `GET /billing/subscription` : nécessite un jeton valide et lit l'abonnement de l'entreprise issue du contexte authentifié, jamais un `companyId` fourni par le client. Les références et secrets du fournisseur de paiement ne sont pas exposés.

Cette étape est volontairement **en lecture seule**. Elle ne crée pas de compte, ne déclenche pas de paiement, ne confirme pas un webhook et ne bloque pas encore toutes les routes opérationnelles selon l'abonnement. Le champ `paidAccessExpected` est un résumé d'état, pas un garde d'accès. Un `BillingAccessGuard` est branché aux routes Missions et Preuves. Il reste désactivé par défaut pour préserver les clients existants ; l'activation nécessite `JOTOLIKO_BILLING_ENFORCEMENT_ENABLED=true`. Une fois activé, l'API refuse les opérations couvertes si l'entreprise n'a pas un abonnement valide `ACTIVE` dont la période payée n'est pas échue, ou `GRACE_PERIOD` dont la grâce n'est pas échue. Le garde n'est pas encore appliqué à d'autres modules/routes. L'inscription autonome ne doit être activée qu'après implémentation et tests des transactions d'activation, de l'idempotence des notifications fournisseur et des limites de sièges côté API.

La CI comprend les tests du domaine, la migration complète sur PostgreSQL 16 jetable, la génération Prisma Client, le typecheck et le build NestJS. Les contrôles sont relancés sur les changements du garde d'abonnement et des contrôleurs Missions/Preuves.

## Statut

- Historique complet des migrations exécuté avec succès sur PostgreSQL 16 jetable en CI ; aucune base partagée ou de production modifiée.
- Validation Prisma, tests du domaine, typecheck NestJS, build de l'API et construction des images Docker de production et de migration ont réussi sur les commits précédents.
- Le garde payant est opt-in et limité actuellement aux routes Missions et Preuves.
- Le devis mensuel en lecture seule vient d'être ajouté ; les contrôles CI du dernier commit doivent encore confirmer le typecheck/build.
- Aucun tarif n'est approuvé ou provisionné. Aucun compte marchand, paiement réel, déploiement ou merge n'a été créé.
- L'inscription autonome, le checkout fournisseur et l'activation après paiement ne sont pas encore implémentés. La politique de conservation des inscriptions abandonnées doit être définie avant toute collecte réelle de données personnelles.
