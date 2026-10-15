# Fondation d'inscription autonome — Jotoliko

## Objectif de cette étape

Préparer le parcours de création d'un compte professionnel sans modifier les comptes existants, sans activer les fonctions payantes avant confirmation serveur du paiement et sans effectuer de migration ou de paiement en production.

Cette note complète `docs/MONTHLY-SELF-SERVICE-SUBSCRIPTIONS.md`. Le socle d'inscription et de reprise décrit ci-dessous est en cours d'implémentation sur une branche isolée ; le parcours de paiement et d'activation reste incomplet.

## État du socle existant vérifié

- Le schéma Prisma canonique est `prisma/schema.prisma`.
- `Company`, `User`, `Membership` et `Role` existent déjà ; l'email utilisateur et le slug d'entreprise sont uniques.
- L'authentification existante crée un jeton à partir d'un utilisateur et d'une appartenance existants. Une première route publique `POST /auth/signup` a été ajoutée sur la branche de travail.
- Le service de facturation expose les prix actifs configurés et des devis indicatifs en lecture seule. Il ne crée pas encore de checkout.
- La branche de travail doit rester isolée jusqu'à validation et tests ; aucune migration de base partagée n'est autorisée à cette étape.

## Décision de conception

Le parcours doit distinguer une tentative d'inscription persistante du compte opérationnel activé :

1. Le client soumet le nom de l'entreprise, l'email, le nom du propriétaire, son mot de passe, un code d'offre et le nombre de places.
2. Le serveur normalise les champs et valide les formats et limites. L'email déjà enregistré est refusé ; le slug de l'entreprise est généré avec un suffixe aléatoire pour éviter une collision technique.
3. Le serveur conserve une tentative d'inscription à durée limitée. Un mot de passe ne doit jamais être stocké en clair ; privilégier un hash fort avec sel, durée de vie limitée et politique de purge.
4. Le client peut reprendre la configuration de son entreprise et choisir le nombre de places. Le prix est toujours calculé à partir d'un tarif actif versionné côté serveur ; si aucun tarif n'est configuré, le checkout reste indisponible et aucun montant n'est inventé.
5. La tentative reste `PENDING_PAYMENT`. Aucun jeton d'accès opérationnel n'est émis. Un jeton de reprise aléatoire est communiqué une seule fois ; seule son empreinte SHA-256 est stockée.
6. Après confirmation vérifiée du prestataire, une transaction unique crée/active `Company`, `User`, l'appartenance avec le rôle `OWNER`, et l'abonnement payé. Les contraintes d'unicité doivent faire échouer proprement les collisions concurrentes.
7. Le webhook doit être authentifié, vérifié côté serveur et idempotent. Un retour navigateur ne peut jamais activer le compte.
8. En cas d'échec, d'expiration ou de fermeture du navigateur, la tentative peut être reprise jusqu'à son expiration. Les données de production ne sont jamais supprimées par ce flux.

## Contrat API à implémenter et tester

- `POST /auth/signup` : créer une tentative et renvoyer l'identifiant, l'état, le tarif serveur et le jeton de reprise (une seule fois).
- `POST /auth/signup/:id/resume` : retourner l'état et le devis serveur uniquement si le jeton de reprise fourni correspond à l'empreinte persistée.
- `PATCH /auth/signup/:id` : modifier la configuration tant que la tentative n'est pas consommée ; cette route reste à implémenter.
- `POST /billing/checkout` : recalculer le montant sur le serveur et créer une session chez un fournisseur configuré. En absence de fournisseur ou de tarif, répondre explicitement « non configuré ».
- `POST /billing/webhooks/:provider` : vérifier la signature et le statut auprès du fournisseur, puis traiter l'événement de manière idempotente.
- L'activation doit être centralisée dans un service serveur commun ; aucun contrôleur ne doit activer un abonnement en se basant sur un paramètre client ou une URL de retour.

## Sécurité et intégrité

- Appliquer la validation DTO, une limite stricte de taille des entrées et le rate limiting.
- Ne jamais journaliser le mot de passe, le hash du mot de passe, le jeton de reprise ou les secrets du fournisseur.
- Stocker uniquement un hash du jeton de reprise et l'expirer côté serveur.
- Utiliser une transaction Prisma pour les écritures de création/activation liées.
- Ajouter des contraintes uniques pour empêcher deux inscriptions concurrentes de réclamer le même email ou slug.
- Vérifier l'existence du rôle `OWNER` dans les données de référence avant l'activation ; ne pas supposer qu'il est présent sans vérifier le mécanisme de seed.
- Ne pas réutiliser le modèle `Payment` opérationnel de livraison pour les paiements d'abonnement.
- Ne pas ajouter de clés réelles, de fournisseur supposé, de tarif par défaut ou de migration exécutée contre la production.

## Tests d'acceptation requis avant toute fusion

1. Inscription valide : tentative créée sans créer prématurément un accès payant.
2. Entrées invalides : erreurs de validation explicites sans écriture partielle.
3. Slug ou email en collision : échec sûr, y compris en cas de requêtes concurrentes.
4. Mot de passe et jeton de reprise : aucune valeur en clair persistée ou journalisée.
5. Reprise : la configuration reste disponible après fermeture/rechargement et après échec de paiement.
6. Prix non configuré : aucun montant inventé et aucun checkout initié.
7. Retour navigateur « succès » sans preuve serveur : compte toujours non activé.
8. Webhook invalide, rejoué ou dupliqué : aucun accès payé accordé à tort et aucune activation en double.
9. Échec ou expiration : la tentative suit la politique annoncée ; aucune donnée opérationnelle existante n'est supprimée.
10. Régression : login des utilisateurs existants, isolation multi-tenant et typecheck restent fonctionnels.

## Critères de sortie de cette étape

La fondation d'inscription et de reprise est partiellement présente : schéma, migration additive, DTO, service, contrôleurs et tests ont été ajoutés. Elle ne sera considérée validée qu'après vérification du typecheck, de l'exécution des tests et revue de sécurité. Le checkout, le webhook et l'activation atomique restent à implémenter.

Aucun merge, déploiement, changement de tarif ou paiement réel n'est autorisé par cette étape.
