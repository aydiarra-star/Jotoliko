# Abonnements mensuels et inscription autonome — Jotoliko

## Décision produit

- Facturation mensuelle, renouvelée tous les mois.
- Une société s'inscrit elle-même, sans intervention manuelle de l'équipe Jotoliko.
- Le montant dépend du nombre de places livreur souscrites.
- L'espace opérationnel payant ne s'ouvre qu'après confirmation serveur du paiement.
- Le propriétaire de la société peut gérer ses livreurs dans la limite des places payées.
- Aucune donnée opérationnelle n'est supprimée à l'expiration ou en cas d'échec de renouvellement.
- Aucun prix par livreur n'est fixé dans ce document : il doit être validé avant d'être affiché ou facturé.

## Parcours cible

1. La société saisit son nom, son identifiant d'espace, son e-mail, son téléphone et un mot de passe.
2. Le serveur valide les données, normalise l'e-mail et vérifie l'unicité du slug et du compte.
3. La société choisit le nombre de places livreur et voit le prix mensuel total avant de continuer.
4. Le serveur crée un dossier d'inscription et une session de paiement en statut PENDING. La société ne reçoit pas encore l'accès aux fonctions payantes.
5. Le prestataire de paiement héberge le formulaire de paiement ou fournit son flux sécurisé.
6. Le serveur vérifie la notification signée / le statut du paiement auprès du prestataire. Le retour navigateur seul ne constitue jamais une preuve de paiement.
7. Après confirmation, une transaction serveur active l'abonnement, crée le compte propriétaire et l'appartenance à la société, puis autorise l'accès.
8. Le propriétaire peut configurer son équipe et ajouter des livreurs jusqu'à la limite souscrite.
9. Avant l'échéance, le client est informé du renouvellement. Le renouvellement est traité par le prestataire uniquement si le produit et le contrat du prestataire le prennent en charge. Sinon, Jotoliko propose un paiement mensuel manuel avec rappel et ne prétend pas effectuer un débit automatique.
10. En cas d'échec ou d'expiration, appliquer une période de grâce configurable et annoncée. Après celle-ci, bloquer les opérations payantes et l'ajout de livreurs, mais préserver les données et permettre l'accès à la facturation et à l'export des données.

## Règles de facturation et de capacité

- Prix calculé côté serveur à partir d'un tarif versionné et du nombre de places choisies.
- Montants en FCFA entiers (XOF), sans calcul de prix fiable côté navigateur.
- Le nombre de places correspond à la capacité de livreurs actifs souscrite. Les règles exactes de comptage (comptes invités, livreurs désactivés, période de changement de plan) doivent être définies avant la mise en production.
- Les changements de quantité prennent effet immédiatement ou au prochain renouvellement selon une règle affichée au client. Ne jamais changer le montant silencieusement.
- Une société ne peut ni créer ni réactiver un livreur si cela dépasse sa capacité payée.
- Une notification de paiement répétée ne doit jamais facturer ni activer deux fois le même abonnement (idempotence).
- Chaque événement de paiement, changement de plan et transition d'état est journalisé.
- Toutes les requêtes métier continuent à être isolées par companyId.

## États minimums

### Inscription
DRAFT → AWAITING_PAYMENT → ACTIVE

États d'erreur/fin possibles : PAYMENT_FAILED, EXPIRED, CANCELLED.

### Abonnement
PENDING_PAYMENT, ACTIVE, PAST_DUE, GRACE_PERIOD, SUSPENDED, CANCELLED, EXPIRED.

Les transitions doivent être centralisées côté serveur et testées ; les valeurs ci-dessus sont une proposition fonctionnelle, pas encore des enums ajoutés au schéma.

## Architecture technique proposée

### Modèle de données à ajouter au schéma Prisma canonique

- SignupAttempt : données minimales d'inscription en attente, slug réservé avec expiration, état et dates ; ne pas stocker un mot de passe en clair. Préférer finaliser le compte après paiement, ou stocker uniquement un hash fort avec une durée de vie courte.
- Subscription : companyId, statut, quantité de places, tarif unitaire figé au moment de l'achat, devise, montant, période courante, échéance, période de grâce, identifiant client/abonnement externe éventuel.
- BillingPayment : companyId, subscriptionId, prestataire, référence externe unique, montant, devise, statut, date de confirmation, identifiant d'idempotence et métadonnées limitées.
- PlanPrice ou configuration tarifaire versionnée côté serveur ; aucune clé secrète ou valeur de confiance dans NEXT_PUBLIC_*.

Les relations et contraintes exactes doivent être revues contre le schéma canonique avant toute migration. Ne pas réutiliser le modèle Payment des encaissements de livraison : la facturation Jotoliko est une catégorie distincte.

### API cible

- POST /auth/signup — valide les données et crée une inscription en attente.
- POST /billing/checkout — calcule le montant sur le serveur et demande une session au prestataire.
- POST /billing/webhooks/:provider — vérifie la signature, l'état et la référence auprès du prestataire, puis traite l'événement de manière idempotente.
- GET /billing/me — retourne l'abonnement, la capacité, l'échéance et les paiements du tenant connecté.
- POST /billing/change-seats — applique les règles de changement de quantité et retourne le montant explicite.
- POST /billing/cancel — demande l'arrêt du renouvellement, sans effacer les données.
- Les gardes NestJS doivent vérifier l'abonnement pour les opérations payantes ; l'interface seule ne suffit pas.

## Paiement : intégration progressive

1. Définir une interface interne BillingProvider pour isoler le produit du fournisseur.
2. Ajouter un faux fournisseur de test, disponible uniquement en environnement de test, pour valider les transitions sans argent réel.
3. Tester les webhooks, signatures invalides, notifications dupliquées, paiements échoués et tentatives de rejeu.
4. Évaluer un prestataire compatible avec les moyens de paiement réellement ciblés au Sénégal et vérifier explicitement le renouvellement récurrent/tokenisé, les frais, les remboursements, les délais de règlement et les conditions marchandes.
5. Activer un environnement sandbox fournisseur seulement après validation ; aucune clé réelle, création de compte marchand ou transaction réelle n'est incluse dans ce chantier.
6. Ne pas promettre le débit automatique mensuel tant que la prise en charge du paiement récurrent n'a pas été confirmée pour le fournisseur et le moyen de paiement retenus.

## Sécurité et conformité

- Hash de mot de passe robuste ; aucun mot de passe en clair dans les logs.
- Vérification d'e-mail et protection contre l'inscription automatisée avant ouverture complète du compte.
- Limitation de débit et anti-abus sur l'inscription et le checkout.
- Validation de signature des webhooks et vérification serveur-à-serveur.
- Montant, devise, société et quantité sont recalculés/vérifiés côté serveur.
- Pas d'activation basée sur une URL de retour ou une capture d'écran de paiement.
- Pas de suppression automatique des données lors d'une suspension.
- Ne pas collecter ni stocker les données de carte ; laisser le prestataire gérer le paiement.
- Prévoir politique de confidentialité, conditions d'abonnement, annulation, facturation, remboursement et conservation des données avant ouverture publique.

## Plan de réalisation

### Étape A — socle sans argent réel
- Valider ce document et le prix par livreur.
- Vérifier le schéma Prisma, migrations, authentification, rôles et contrôles de capacité.
- Créer les modèles et migrations sur une branche isolée.
- Construire le service de calcul tarifaire versionné et les gardes d'abonnement.
- Ajouter des tests unitaires et d'intégration sur un faux fournisseur de test.
- Construire le parcours mobile-first d'inscription, choix de quantité et statut de paiement.

### Étape B — sandbox du prestataire
- Choisir le prestataire après vérification des capacités récurrentes.
- Ajouter checkout et webhook en sandbox.
- Tester paiements réussis/échoués, événements dupliqués, signature invalide, expiration et renouvellement.
- Vérifier l'isolation entre sociétés et les limites de livreurs.

### Étape C — ouverture réelle, autorisation explicite requise
- Valider prix, conditions commerciales et règles de suspension.
- Configurer les secrets dans l'hébergement, jamais dans Git.
- Effectuer une revue de sécurité et un test de bout en bout.
- N'activer les paiements réels et le déploiement qu'après accord explicite.

## Critères d'acceptation

- Une société peut suivre le parcours sans contacter l'administrateur.
- Un paiement non confirmé ne débloque aucun formulaire opérationnel payant.
- Un paiement confirmé active une seule société et un seul abonnement, même si le webhook est rejoué.
- Une société de cinq places ne peut pas dépasser cinq livreurs actifs selon la règle de capacité retenue.
- Une société ne peut lire ou modifier les données d'une autre société.
- Un renouvellement échoué ne supprime pas les missions, preuves, encaissements ou rapports.
- Le client voit le montant, la quantité, la prochaine échéance et l'état de son abonnement.
- Tous les tests peuvent s'exécuter sans clé réelle ni paiement réel.

## Limites de cette proposition

Ce document décrit le contrat fonctionnel et le plan de réalisation ; il ne prétend pas que l'inscription publique, la facturation récurrente ou le paiement sont déjà implémentés. Il ne modifie pas les données, ne déploie rien, ne crée pas de compte marchand et ne lance aucune transaction réelle.
