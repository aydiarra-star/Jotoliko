# Fondation d'inscription autonome — Jotoliko

## Objectif de cette étape

Préparer le parcours de création d'un compte professionnel sans modifier les comptes existants, sans activer les fonctions payantes avant confirmation serveur du paiement et sans effectuer de migration ou de paiement en production.

Cette note complète `docs/MONTHLY-SELF-SERVICE-SUBSCRIPTIONS.md`. Elle ne remplace pas le schéma Prisma canonique et ne prétend pas que le parcours est déjà implémenté.

## État du socle existant vérifié

- Le schéma Prisma canonique est `prisma/schema.prisma`.
- `Company`, `User`, `Membership` et `Role` existent déjà ; l'email utilisateur et le slug d'entreprise sont uniques.
- L'authentification actuelle crée un jeton à partir d'un utilisateur et d'une appartenance existants ; il n'existe pas encore de route publique `POST /auth/signup` dans le contrôleur consulté.
- Le service de facturation expose les prix actifs configurés et des devis indicatifs en lecture seule. Il ne crée pas encore de checkout.
- La branche de travail doit rester isolée jusqu'à validation et tests ; aucune migration de base partagée n'est autorisée à cette étape.

## Décision de conception

Le parcours doit distinguer une tentative d'inscription persistante du compte opérationnel activé :

1. Le client soumet le nom de l'entreprise, le slug demandé, l'email, le téléphone, le nom du propriétaire et son mot de passe.
2. Le serveur normalise les champs, valide les formats et limites, puis vérifie les conflits de slug et d'email. Les erreurs ne doivent pas révéler inutilement si un email est déjà enregistré.
3. Le serveur conserve une tentative d'inscription à durée limitée. Un mot de passe ne doit jamais être stocké en clair ; privilégier un hash fort avec sel, durée de vie limitée et politique de purge.
4. Le client peut reprendre la configuration de son entreprise et choisir le nombre de places. Le prix est toujours calculé à partir d'un tarif actif versionné côté serveur ; si aucun tarif n'est configuré, le checkout reste indisponible et aucun montant n'est inventé.
5. La tentative passe à `AWAITING_PAYMENT` uniquement lorsque les données minimales sont validées. Aucun jeton donnant accès aux fonctions payantes n'est émis à ce stade.
6. Après confirmation vérifiée du prestataire, une transaction unique crée/active `Company`, `User`, l'appartenance avec le rôle `OWNER`, et l'abonnement payé. Les contraintes d'unicité doivent faire échouer proprement les collisions concurrentes.
7. Le webhook doit être authentifié, vérifié côté serveur et idempotent. Un retour navigateur ne peut jamais activer le compte.
8. En cas d'échec, d'expiration ou de fermeture du navigateur, la tentative peut être reprise jusqu'à son expiration. Les données de production ne sont jamais supprimées par ce flux.

## Contrat API à implémenter et tester

- `POST /auth/signup` : créer ou reprendre une tentative ; réponse minimale avec un identifiant opaque et l'état, sans exposer le hash du secret.
- `GET /auth/signup/:id` : retourner uniquement les étapes et champs non sensibles autorisés pour la reprise, après preuve de possession d'un jeton de reprise à durée limitée.
- `PATCH /auth/signup/:id` : modifier la configuration tant que la tentative n'est pas consommée, avec validation et limitation de débit.
- `POST /billing/checkout` : recalculer le montant sur le serveur et créer une session chez un fournisseur configuré. En absence de fournisseur ou de tarif, répondre explicitement « non configuré ».
- `POST /billing/webhooks/:provider` : vérifier la signature et le statut auprès du fournisseur, puis traiter l'événement de manière idempotente.
- L'activation doit être centralisée dans un service serveur commun ; aucun contrôleur ne doit activer un abonnement en se basant sur un paramètre client ou une URL de retour.

## Sécurité et intégrité

- Appliquer la validation DTO, une limite stricte de taille des entrées et le rate limiting.
- Ne jamais journaliser le mot de passe, le hash du mot de passe, le jeton de reprise ou les secrets du fournisseur.
- Stocker uniquement un hash du jeton de reprise et l'expirer côté serveur.
- Utiliser une transaction Prisma pour les écritures de création/activation liées.
- Ajouter des contraintes uniques pour empêcher deux inscriptions concurrentes de réclamer le même email ou slug.
- Vérifier l'existence du rôle `OWNER` dans les données de référence ; ne pas supposer qu'il est présent sans vérifier le mécanisme de seed.
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

La fondation ne sera considérée comme implémentée que lorsque le schéma, la migration isolée, les DTO, le service, les contrôleurs et les tests correspondants seront présents et que les contrôles CI seront verts. La présente note seule n'est pas une preuve de fonctionnalité.

Aucun merge, déploiement, changement de tarif ou paiement réel n'est autorisé par cette étape.
