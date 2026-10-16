# Checklist de préparation PayDunya — sandbox

## Objet et limites

Ce guide permet de préparer une validation de bout en bout du parcours d'inscription et de paiement Jotoliko **en sandbox uniquement**. Les tests automatisés verts valident le code testé, mais ne prouvent ni la disponibilité du compte marchand, ni la configuration des clés, ni un paiement de bout en bout auprès de PayDunya.

Ce document ne configure aucun secret, ne fixe aucun tarif, ne crée aucun compte marchand et ne déclenche aucun paiement. Ne pas effectuer cette procédure sur la production.

## 1. Préconditions à valider

- [ ] Confirmer que le compte marchand PayDunya existe et que l'accès à l'environnement sandbox est disponible.
- [ ] Confirmer dans la documentation et dans le compte marchand les méthodes de paiement réellement disponibles. Ne pas les déduire de logos ou d'une liste générale de moyens de paiement.
- [ ] Décider et approuver le prix mensuel par place livreur en FCFA, ainsi que les règles de capacité et de changement de quantité.
- [ ] Créer un tarif versionné actif dans la base **de test** selon le schéma Prisma courant. Vérifier code, version, devise XOF, montant unitaire, dates d'effet et état actif. Ne pas inventer de prix ni copier une valeur de test en production.
- [ ] Vérifier que l'URL de l'API de test est accessible depuis le navigateur de test et que les URLs de callback, retour et annulation pointent vers l'environnement de test.
- [ ] Vérifier que la configuration ne contient aucune clé dans le dépôt, les variables publiques de frontend, les journaux ou les captures d'écran.

## 2. Variables serveur attendues

Configurer les variables uniquement dans l'environnement serveur de test, via le gestionnaire de secrets de l'hébergeur ou un mécanisme local non versionné :

- PAYDUNYA_MODE=sandbox
- PAYDUNYA_MASTER_KEY
- PAYDUNYA_PRIVATE_KEY
- PAYDUNYA_TOKEN
- PAYDUNYA_CALLBACK_URL
- PAYDUNYA_RETURN_URL
- PAYDUNYA_CANCEL_URL

Les clés doivent être fournies par le compte marchand / la documentation PayDunya pour l'environnement visé. Ne jamais les envoyer dans un ticket, une PR, un chat ou un fichier suivi par Git. Vérifier que le code de configuration refuse les URLs de paiement non HTTPS ou hors du domaine attendu.

## 3. Parcours manuel sandbox

Utiliser une adresse e-mail de test et des données fictives, sans données personnelles ou opérationnelles réelles.

1. Ouvrir la page d'inscription sur l'environnement de test.
2. Vérifier que la page affiche une erreur explicite si l'API est indisponible ou si aucun tarif actif n'est configuré ; elle ne doit pas inventer de prix.
3. Vérifier que le montant affiché correspond au nombre de places multiplié par le tarif actif, puis vérifier que le serveur recalcule le montant indépendamment des valeurs envoyées par le navigateur.
4. Démarrer le checkout et vérifier que l'inscription reste en attente et que les fonctions opérationnelles payantes sont verrouillées.
5. Suivre le flux de paiement sandbox fourni par PayDunya.
6. Tester le retour navigateur, puis vérifier séparément l'état confirmé côté serveur. Un simple retour vers la page de succès ne doit jamais activer le compte.
7. Après confirmation serveur valide, vérifier qu'une seule société, un seul compte propriétaire et un seul abonnement sont créés et que la capacité souscrite est appliquée.
8. Rejouer la notification de confirmation si l'environnement sandbox permet de le faire ; l'opération doit rester idempotente.
9. Tester l'annulation, l'échec, l'expiration et une notification invalide ou incohérente, selon les possibilités de la sandbox.
10. Vérifier les journaux : aucune clé, aucun mot de passe ni donnée de carte ne doit être journalisé.

## 4. Scénarios d'acceptation

| Scénario | Résultat attendu |
| --- | --- |
| Aucun tarif actif | Checkout refusé avec message explicite ; aucun montant inventé |
| Montant ou devise incohérents | Paiement non activé ; erreur journalisée sans secret |
| Retour navigateur sans confirmation serveur | Compte non activé |
| Paiement confirmé et vérifié côté serveur | Activation unique et accès conforme à la capacité payée |
| Notification de paiement répétée | Pas de double activation ni de double abonnement |
| Référence inconnue ou notification invalide | Pas d'activation |
| Checkout annulé, échoué ou expiré | Accès payant toujours verrouillé |
| Société A tente d'accéder aux données de B | Accès refusé |
| Clés sandbox absentes | Échec explicite et sûr, sans simuler un paiement réussi |

## 5. Preuves à conserver

Pour chaque exécution, noter sans données sensibles :

- commit testé et URL de l'environnement de test ;
- date et résultat de chaque scénario ;
- référence de facture masquée ou identifiant de test non sensible ;
- statut observé côté fournisseur et statut observé côté serveur ;
- captures d'écran expurgées des données personnelles ;
- éventuels logs expurgés et identifiant de corrélation.

Les tests unitaires avec fournisseur simulé et les tests PayDunya sandbox doivent être consignés séparément : ils ne constituent pas la même preuve.

## 6. Ce qui reste distinct de la sandbox

- **Renouvellement automatique :** ne pas le présenter comme disponible tant que la capacité récurrente n'est pas confirmée pour le contrat, le moyen de paiement et l'intégration retenus. Prévoir le paiement mensuel manuel si nécessaire.
- **Prix commercial :** aucun prix ne doit être publié avant approbation explicite.
- **Production :** aucune clé réelle, migration, transaction réelle ou publication ne fait partie de cette checklist. Toute activation de production nécessite une approbation explicite et une revue finale.

## Sources de vérité dans le dépôt

- docs/MONTHLY-SELF-SERVICE-SUBSCRIPTIONS.md — parcours cible et règles de facturation.
- docs/PAYMENT-PROVIDER-AND-LOGOS.md — fournisseur envisagé et règles d'affichage des marques.
- .github/workflows/paydunya-client-tests.yml — contrôles automatisés du code.
