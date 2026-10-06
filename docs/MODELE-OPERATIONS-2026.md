# Modèle opérationnel Jotoliko

## Mission
Une mission relie une commande à un livreur, un client, une adresse, une preuve, un état GPS et un état financier.

## États
A_AFFECTER → AFFECTEE → EN_ROUTE → ARRIVE → LIVREE.

Les échecs, retours et reprogrammations sont des états/branches explicites et ne remplacent pas l'historique.

## Finance
- expected : montant attendu
- collected : montant encaissé
- remitted : montant remis
- difference : écart de remise

Le montant d'un paiement historique ne doit jamais être modifié silencieusement.

## GPS
La fraîcheur est dérivée d'un timestamp reçu. Aucun ETA n'est calculé si les données nécessaires ne sont pas disponibles.

## Preuve
Une mission dont la preuve est obligatoire ne peut pas être clôturée sans preuve.
