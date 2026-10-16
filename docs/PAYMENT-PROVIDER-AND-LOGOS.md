# Paiement et logos officiels — Jotoliko

## Décision de travail

Le premier fournisseur à évaluer pour le Sénégal est **PayDunya Checkout hébergé**, sans l'activer tant que le compte marchand, les clés et les moyens disponibles sur ce compte ne sont pas confirmés.

Raisons :
- La documentation officielle liste pour le Sénégal Orange Money, Free Money, Expresso, Wave, Wizall et Djamo, ainsi que les cartes bancaires au niveau international.
- Le checkout hébergé laisse le prestataire afficher ses propres logos et moyens activés, plutôt que de dessiner ou d'imiter les marques dans Jotoliko.
- La vérification du statut d'une facture doit être effectuée côté serveur avec le jeton de facture et les clés du marchand. Le retour navigateur seul ne suffit pas.

Références officielles consultées le 16 octobre 2026 :
- https://developers.paydunya.com/doc/FR/api_softpay_index
- https://developers.paydunya.com/doc/FR/softpay
- https://developers.paydunya.com/doc/FR/NodeJS

Cette intégration technique en branche ne signifie pas que Jotoliko possède déjà un compte marchand PayDunya, que les méthodes sont activées pour ce compte, ni que le paiement récurrent est pris en charge. Aucun secret marchand n'est enregistré dans le dépôt.

## Règles d'affichage des logos

1. **Utiliser les vrais logos de marque.** Pas d'emoji, de pastille colorée, de texte stylisé ou d'icône générique à la place du logo Wave, Orange Money, Free Money, Expresso, Wizall, Djamo, Visa ou Mastercard.
2. Tant que le checkout hébergé est retenu, laisser PayDunya afficher les marques officielles sur sa page de paiement.
3. Si une interface de paiement intégrée est retenue ultérieurement, importer les ressources officielles fournies par chaque marque ou par le fournisseur contractuel, vérifier leurs conditions d'utilisation, puis les stocker comme fichiers statiques versionnés dans le dépôt.
4. Ne montrer que les méthodes confirmées actives pour le compte marchand et l'environnement utilisé. La liste générale d'un fournisseur n'est pas une preuve d'activation sur le compte Jotoliko.
5. Les moyens de paiement sont masqués ou signalés indisponibles lorsque la configuration du fournisseur manque. Ne jamais faire croire qu'un logo signifie qu'un paiement fonctionne déjà.
6. Les logos restent décoratifs : le nom accessible de chaque moyen doit être fourni aux lecteurs d'écran et le choix de paiement doit être réellement pris en charge côté serveur.

## Mensualités

La documentation consultée confirme des flux de paiement et de vérification de facture, mais ne suffit pas à garantir le débit automatique récurrent pour tous les moyens sénégalais. Jusqu'à confirmation contractuelle et technique, le produit doit parler de **paiement mensuel**, et non de prélèvement automatique. Un renouvellement manuel avec rappel est acceptable comme première version.

## Parcours implémenté dans la branche

- `POST /billing/signup/:id/checkout` vérifie l'identifiant et le jeton secret de reprise, l'expiration, le tarif XOF actif et calcule le montant depuis les données serveur.
- Le checkout hébergé n'est accessible que via une URL HTTPS sur `app.paydunya.com`. L'URL et le jeton de facture sont conservés dans `BillingPayment` pour permettre de reprendre une facture en attente.
- `POST /billing/paydunya/callback` traite le jeton reçu comme un simple indice : l'API vérifie ensuite la facture directement auprès de PayDunya.
- L'activation compare le statut `completed`, le montant exact, la devise `XOF` et la référence d'inscription. La création de l'entreprise, du propriétaire, de son rôle, de l'abonnement actif et la confirmation du paiement se font dans une transaction unique.
- Les notifications répétées sont idempotentes lorsque le paiement et l'inscription sont déjà actifs. Une incohérence ou un état expiré ne déclenche pas de création partielle.

## Configuration et limites avant toute mise en service

1. Configurer `PAYDUNYA_MODE=sandbox`, `PAYDUNYA_MASTER_KEY`, `PAYDUNYA_PRIVATE_KEY`, `PAYDUNYA_TOKEN` et les trois URLs HTTPS `PAYDUNYA_CALLBACK_URL`, `PAYDUNYA_RETURN_URL`, `PAYDUNYA_CANCEL_URL` dans l'environnement serveur seulement. Le callback doit viser `/billing/paydunya/callback`.
2. Exécuter la migration additive `20261016070000_billing_checkout_url` dans un environnement de test jetable, puis générer le client Prisma et exécuter les tests.
3. Tester avec un compte marchand sandbox : succès, attente, annulation, échec, callback répété, montant incorrect, devise incorrecte, référence incorrecte, jeton inconnu, inscription expirée et e-mail déjà utilisé.
4. Vérifier qu'un rôle `OWNER` est présent dans les données de référence avant de tester l'activation. Si ce rôle manque, la transaction d'activation est annulée.
5. Ne passer en mode réel qu'après validation des tests, compte marchand approuvé et configuration des secrets côté hébergeur. Le mode réel exige `PAYDUNYA_ALLOW_LIVE=true` en plus de `PAYDUNYA_MODE=live`.
6. Le premier paiement ouvre une période d'un mois. **Le renouvellement automatique n'est pas implémenté** : ne pas annoncer un prélèvement récurrent sans capacité contractuelle et technique confirmée.
7. Les logos restent ceux du checkout PayDunya hébergé. Ne montrer aucune méthode comme disponible sur le site Jotoliko sans preuve qu'elle est active sur le compte marchand.

L'intégration dans cette branche ne configure pas de compte marchand, ne fournit pas de secrets, ne fixe aucun tarif, ne déclenche aucune transaction réelle et ne déploie ni ne fusionne le code.
