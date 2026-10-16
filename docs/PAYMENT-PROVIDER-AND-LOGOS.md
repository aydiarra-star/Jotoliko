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

Cette évaluation n'affirme pas que Jotoliko possède déjà un compte marchand PayDunya, que les méthodes sont activées pour ce compte ou que le paiement récurrent est pris en charge.

## Règles d'affichage des logos

1. **Utiliser les vrais logos de marque.** Pas d'emoji, de pastille colorée, de texte stylisé ou d'icône générique à la place du logo Wave, Orange Money, Free Money, Expresso, Wizall, Djamo, Visa ou Mastercard.
2. Tant que le checkout hébergé est retenu, laisser PayDunya afficher les marques officielles sur sa page de paiement.
3. Si une interface de paiement intégrée est retenue ultérieurement, importer les ressources officielles fournies par chaque marque ou par le fournisseur contractuel, vérifier leurs conditions d'utilisation, puis les stocker comme fichiers statiques versionnés dans le dépôt.
4. Ne montrer que les méthodes confirmées actives pour le compte marchand et l'environnement utilisé. La liste générale d'un fournisseur n'est pas une preuve d'activation sur le compte Jotoliko.
5. Les moyens de paiement sont masqués ou signalés indisponibles lorsque la configuration du fournisseur manque. Ne jamais faire croire qu'un logo signifie qu'un paiement fonctionne déjà.
6. Les logos restent décoratifs : le nom accessible de chaque moyen doit être fourni aux lecteurs d'écran et le choix de paiement doit être réellement pris en charge côté serveur.

## Mensualités

La documentation consultée confirme des flux de paiement et de vérification de facture, mais ne suffit pas à garantir le débit automatique récurrent pour tous les moyens sénégalais. Jusqu'à confirmation contractuelle et technique, le produit doit parler de **paiement mensuel**, et non de prélèvement automatique. Un renouvellement manuel avec rappel est acceptable comme première version.

## Conditions avant l'activation

- Compte marchand approuvé et clés stockées uniquement dans les secrets du serveur.
- Mode sandbox configuré et tests de bout en bout réalisés.
- Création de facture côté serveur à partir du tarif actif, du montant et de la devise recalculés.
- Vérification serveur du statut final auprès de l'API du fournisseur.
- Traitement idempotent des notifications et des retours.
- Activation atomique de l'entreprise, du propriétaire, de l'abonnement et de la capacité après paiement confirmé seulement.
- Tests de paiement en attente, annulé, échoué, notification répétée et montant/devise incohérents.
- Affichage des logos officiels uniquement pour les méthodes activées.

Aucune clé, transaction réelle, méthode active, tarif commercial ou activation de compte n'est créé par ce document.
