# Inscription professionnelle en libre-service — Jotoliko

## État vérifié de la branche

Cette fondation est implémentée sur `feat/self-service-signup-foundation` et proposée dans la PR #8. Elle n'est pas encore fusionnée ni déployée.

- `POST /auth/signup` crée une tentative limitée à 24 h, sans créer prématurément un compte opérationnel.
- Le tarif est sélectionné dans les tarifs actifs côté serveur en XOF ; aucun tarif par défaut n'est inventé.
- Le mot de passe est haché avec un sel aléatoire. Le jeton de reprise est aléatoire et seule son empreinte SHA-256 est persistée.
- La reprise et la modification d'une tentative en attente nécessitent le jeton secret.
- `POST /billing/signup/:id/checkout` réserve un paiement, calcule le montant côté serveur et utilise le checkout hébergé PayDunya. Une facture en attente peut être réutilisée.
- `POST /billing/paydunya/callback` et `POST /billing/paydunya/return` traitent le jeton comme un identifiant, puis demandent une confirmation directement à PayDunya. Le service vérifie la signature de confirmation, le statut terminé, le montant exact et la référence d'inscription.
- Après confirmation valide, une transaction Prisma crée l'entreprise, le propriétaire, son appartenance OWNER et l'abonnement actif pour la première période mensuelle, puis confirme le paiement et active la tentative.
- Les callbacks répétés sont idempotents. Les migrations additives ajoutent l'URL de checkout et créent le rôle OWNER uniquement s'il est absent.
- La page publique « Créer un compte professionnel » affiche les tarifs renvoyés par l'API et n'affirme pas qu'un compte est activé avant confirmation serveur.

## Vérifications CI observées

Sur le commit de tête vérifié lors de l'audit, les workflows suivants sont terminés avec succès :

- Tests du client PayDunya.
- Tests de facturation et de sécurité du checkout.
- Tests du service d'inscription et de l'activation après paiement.
- Build de la page d'inscription.
- Typecheck et build de l'API.
- Test des migrations sur PostgreSQL jetable.
- Validation de configuration de déploiement.

Ces tests ne remplacent pas un test d'intégration avec le compte marchand PayDunya réel ou sandbox.

## Configuration requise avant un test sandbox

Configurer uniquement dans l'environnement serveur, jamais dans le dépôt ou dans une variable `NEXT_PUBLIC_*` :

- `PAYDUNYA_MODE=sandbox`
- `PAYDUNYA_ALLOW_LIVE=false`
- `PAYDUNYA_MASTER_KEY`
- `PAYDUNYA_PRIVATE_KEY`
- `PAYDUNYA_TOKEN`
- `PAYDUNYA_CALLBACK_URL`
- `PAYDUNYA_RETURN_URL`
- `PAYDUNYA_CANCEL_URL`
- `NEXT_PUBLIC_API_BASE_URL` côté site, défini au moment du build pour appeler l'API publique.

Les trois URL PayDunya doivent être publiques et en HTTPS. En production, le mode sandbox est refusé. Le mode live nécessite explicitement `PAYDUNYA_MODE=live` et `PAYDUNYA_ALLOW_LIVE=true`, en plus des secrets valides.

## Scénarios d'acceptation avant ouverture commerciale

1. Sans tarif actif, l'inscription payante et le checkout restent indisponibles ; aucune facture n'est créée.
2. Sans configuration PayDunya, aucun paiement n'est lancé et aucune activation n'est possible.
3. Une facture en attente est réutilisée ; des requêtes concurrentes ne doivent pas créer volontairement plusieurs factures pour la même tentative.
4. Un callback falsifié, une référence inconnue, un statut non terminé, un montant différent ou une signature invalide ne peut pas activer un compte.
5. Un callback réussi crée entreprise, utilisateur, rôle OWNER, appartenance et abonnement dans une seule transaction.
6. Un callback rejoué ne crée pas un second compte ou abonnement.
7. Un paiement confirmé pour une facture créée avant l'expiration peut être finalisé après un délai de notification ; une tentative expirée sans facture valide reste non activable.
8. Vérifier les scénarios sandbox réels : paiement réussi, paiement annulé, paiement en attente, notification répétée et retour navigateur avant notification serveur.
9. Vérifier le login du propriétaire créé et l'isolation multi-tenant après activation.
10. Vérifier les parcours d'échec et de reprise sur téléphone.

## Gestion d'une création de facture au résultat incertain

Si la requête de création PayDunya expire ou si la base de données ne parvient pas à enregistrer le jeton après la création de la facture, l'API ne communique pas de lien de paiement et bloque toute nouvelle facture automatique tant que l'état précédent ne peut pas être rapproché. Cette protection évite qu'une requête répétée ne provoque un double paiement, mais elle peut nécessiter une vérification exceptionnelle dans le tableau de bord marchand PayDunya.

Avant l'ouverture commerciale, prévoir une procédure d'exploitation : retrouver la facture côté PayDunya à partir de l'heure, du montant et des informations de référence disponibles ; confirmer son état ; ne jamais supprimer ou réinitialiser la ligne de paiement pour forcer une nouvelle tentative ; ne reprendre le parcours qu'après rapprochement documenté. Ne jamais demander au client d'envoyer ses clés API ou ses informations bancaires. Cette procédure exceptionnelle ne remplace pas le parcours automatique nominal.

## Limites explicites

- Aucun compte marchand PayDunya ni secret réel n'est configuré dans le dépôt. Le fonctionnement réel du paiement n'est donc pas encore validé de bout en bout.
- Les prix doivent être configurés dans la base par une procédure autorisée ; aucun prix n'est semé par cette fondation.
- Le paiement couvre la première période mensuelle. Le prélèvement/renouvellement automatique n'est pas implémenté et ne doit pas être présenté comme actif.
- Le site doit recevoir l'URL réelle de l'API au build pour activer l'inscription publique ; en son absence, le formulaire reste désactivé.
- La migration `20261016080000_seed_owner_role` est additive et conserve tout rôle OWNER existant. Les migrations de cette branche ne doivent pas être exécutées en production sans revue et approbation explicites.

## Gouvernance

La PR #8 reste en brouillon jusqu'à la revue de sécurité et au test sandbox. Aucun merge, déploiement, changement de tarif, achat de service, paiement réel ou migration de production n'est autorisé par cette étape.
