# Renouvellement mensuel — conception sûre (Jotoliko)

## Statut

Document de conception uniquement. Cette branche part du commit `8677cf1321dc39a93f4b9e57bcc5226915603913` de la PR #8. Aucun paiement, secret marchand, migration de production, déploiement ou fusion n'est effectué par ce document.

Le renouvellement automatique n'est PAS disponible tant que PayDunya n'a pas confirmé explicitement la capacité récurrente pour le compte marchand Jotoliko et les moyens de paiement retenus. Une facture Checkout ordinaire créée chaque mois n'est pas un prélèvement automatique.

## Décision de livraison

1. Préparer un parcours de renouvellement sûr qui peut fonctionner en mode « paiement mensuel manuel avec rappel ».
2. N'activer le débit automatique qu'après confirmation contractuelle et technique du fournisseur et tests sandbox réussis.
3. Conserver l'accès payé jusqu'à la fin de la période en cours. Utiliser la période de grâce configurée avant toute suspension, avec avertissement clair au professionnel.
4. Ne jamais renouveler la période ou activer un accès sur la seule base du retour navigateur ou d'un callback non vérifié.

## Modèle de période et invariants

- `Subscription.currentPeriodStart` et `currentPeriodEnd` sont les bornes de la période payée.
- Un renouvellement doit référencer une période cible déterministe (début et fin) et un montant calculé côté serveur à partir du tarif/version enregistré.
- Une contrainte unique en base doit empêcher plus d'une tentative de facturation pour le même abonnement et la même période, indépendamment du nombre de workers.
- Toute demande au fournisseur utilise une clé d'idempotence stable, si l'API du fournisseur la prend réellement en charge. Ne pas supposer qu'un simple champ local rend l'appel réseau idempotent.
- Les états d'une tentative doivent distinguer au minimum : préparation, en attente fournisseur, confirmé, échec terminal, état inconnu / réconciliation requise.
- Un timeout après envoi à un fournisseur laisse un résultat ambigu : vérifier la facture connue côté serveur avant toute nouvelle création. Ne jamais « réessayer à l'aveugle ».
- Une facture confirmée doit être contrôlée côté serveur : référence exacte, montant exact, devise XOF et statut final réussi. Un écart bloque l'extension de période et déclenche une réconciliation.
- Le traitement du callback doit être idempotent : un callback répété ne peut ni prolonger deux fois la période, ni créer deux paiements.
- La confirmation du paiement, l'enregistrement du paiement et l'extension de la période doivent être effectués dans une transaction de base de données avec contrôle concurrentiel.
- Les dates de renouvellement suivent le calendrier mensuel et préservent autant que possible le jour d'origine (ex. 31 janvier -> dernier jour de février), sans dérive mensuelle.

## Traitement planifié

Un job planifié ne doit que repérer les abonnements à traiter et réserver atomiquement une tentative unique ; il ne doit pas présumer qu'un débit a réussi.

1. Sélectionner les abonnements actifs dont l'échéance approche et ceux en retard qui n'ont pas dépassé leur période de grâce.
2. Créer/récupérer une tentative unique pour la période cible dans une transaction courte.
3. En mode manuel, envoyer une notification de renouvellement avec le lien vers le checkout hébergé ; aucun débit silencieux n'est annoncé.
4. En mode automatique, autoriser l'appel fournisseur uniquement si la capacité de paiement récurrent est confirmée et que le client a explicitement consenti au mandat/mécanisme applicable.
5. Réconcilier les résultats inconnus auprès du fournisseur avant toute nouvelle tentative.
6. Enregistrer les tentatives avec horodatage et résultat sans jamais journaliser les clés secrètes ni les données de paiement sensibles.

## Échecs et accès

- Paiement en attente ou résultat inconnu : ne pas prolonger la période ; conserver l'état et réconcilier.
- Échec temporaire : une nouvelle tentative n'est permise qu'après vérification de l'état de la précédente, avec délai croissant et limite stricte.
- Échec terminal : passer en `PAST_DUE` ou `GRACE_PERIOD` selon la politique configurée et notifier le propriétaire.
- Fin de grâce sans paiement : suspendre les fonctions payantes selon les règles produit, sans supprimer les données de l'entreprise.
- Paiement confirmé tardivement pour la période attendue : appliquer une seule fois la période correcte, en vérifiant qu'une période plus récente n'a pas déjà été réglée.
- Annulation à échéance : empêcher les renouvellements futurs, tout en conservant l'accès jusqu'à la fin de la période payée.
- Les actions de suspension/réactivation doivent être auditables et réversibles ; ne jamais supprimer une entreprise ou ses données lors d'un échec de paiement.

## Vérifications automatisées obligatoires

- Deux workers concurrents pour le même abonnement et la même période ne créent qu'une seule tentative.
- Deux callbacks identiques n'appliquent qu'une seule extension de période.
- Montant, devise, référence ou statut incohérent : aucun renouvellement.
- Timeout après création de facture : aucune nouvelle facture tant que l'état précédent est ambigu.
- Échec terminal confirmé : nouvelle tentative contrôlée autorisée selon la politique.
- Tarif modifié après émission d'une facture : cette facture conserve le montant/version initialement enregistrés.
- Paiement en retard, paiement répété, paiement d'une période déjà dépassée et callback hors ordre.
- Échéances mensuelles de fin de mois et année bissextile.
- Période de grâce, fin de grâce, annulation à échéance et réactivation après paiement.
- Isolation multi-tenant : un propriétaire ne peut lire que l'abonnement et les factures de sa société.
- Aucune route publique ne peut forcer le statut d'abonnement ou marquer un paiement confirmé.

## Critères de sortie avant production

- CI verte sur la branche de travail.
- Migration testée sur PostgreSQL jetable ; aucune migration de production sans approbation.
- Test sandbox de bout en bout avec compte marchand, couvrant succès, attente, échec, callback répété et réconciliation.
- Confirmation écrite de PayDunya sur les capacités de récurrence, les moyens admissibles, le consentement/mandat, les notifications, les remboursements et les règles de nouvelle tentative.
- Secrets exclusivement dans la configuration serveur sécurisée.
- Aucun affichage produit ne promet le prélèvement automatique avant que ces conditions soient remplies.

## Questions à confirmer auprès de PayDunya

Demander au support marchand, par écrit :
1. Le compte Jotoliko peut-il déclencher des paiements récurrents/abonnements sans nouvelle action du client ?
2. Pour quels moyens précis au Sénégal (Wave, Orange Money, Free Money, cartes, autres) ?
3. Quel mécanisme de consentement ou de mandat est requis et comment le client peut-il révoquer son autorisation ?
4. Existe-t-il une API dédiée, une clé d'idempotence, des webhooks signés et une API fiable de réconciliation ?
5. Quelles sont les limites, frais, règles d'échec, remboursements et exigences de conformité ?
6. Le mode sandbox permet-il de simuler les renouvellements et échecs récurrents ?

En attendant ces réponses, le comportement sûr et commercialement honnête est le renouvellement mensuel avec rappel et checkout hébergé, pas un faux prélèvement automatique.
