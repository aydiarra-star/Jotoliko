# Suivi de livraison — architecture

## 1. Ce qui existe dans ce dépôt

Le dépôt contient le **site marketing** et la **documentation produit**. Il ne
contient pas encore l'API NestJS ni l'application Flutter.

Le suivi de livraison livré ici est donc :

- une **logique métier réelle et testée** (`lib/tracking.ts`, 29 tests) ;
- une **interface de suivi fonctionnelle** (`components/tracking/`) ;
- alimentée par des **données de démonstration explicitement signalées**
  (`lib/demo.ts`, bandeau « Mode démonstration »).

Aucune donnée réelle n'est affichée, et rien ne prétend le contraire.

## 2. La règle centrale

Le produit ne doit **jamais inventer** une position ni une ETA. Cette règle est
implémentée, pas seulement documentée.

### Position

`evaluerFraicheur(position, maintenant)` retourne quatre états :

| État | Condition | Ce que l'interface affiche |
| --- | --- | --- |
| `FRAICHE` | âge ≤ 60 s | « Dernière position : il y a 8 s » + pastille « à jour » |
| `ANCIENNE` | 60 s < âge ≤ 15 min | « Dernière position connue : il y a 4 min » |
| `INDISPONIBLE` | âge > 15 min, ou horodatage futur | « Position indisponible · dernière position il y a 32 min » |
| `AUCUNE_DONNEE` | aucune position reçue | « Position indisponible » |

Le marqueur du livreur **n'est pas affiché du tout** dans les états
`INDISPONIBLE` et `AUCUNE_DONNEE`. Une position périmée ne peut donc jamais
être présentée comme actuelle. Un horodatage dans le futur est traité comme
incohérent et refusé, plutôt que d'afficher un âge négatif.

### ETA

`calculerEta()` exige **trois** conditions, et retourne sinon une raison
d'indisponibilité :

1. le statut est `EN_ROUTE` ;
2. la dernière position est `FRAICHE` ;
3. une vitesse a été **réellement mesurée** entre deux positions successives.

La vitesse est refusée si le déplacement est nul, si le temps écoulé est
négligeable, ou si elle dépasse 120 km/h (GPS erratique). Il n'existe aucun
paramètre de vitesse par défaut : sans mesure, il n'y a pas d'ETA.

## 3. Trajet affiché

Le tracé plein suit les **points réellement enregistrés** (`trace`). Aucune
route n'est dessinée à partir d'un service de routage.

La partie en pointillés relie la dernière position connue à la destination :
c'est une liaison directe, et l'interface le dit explicitement. Elle n'est
affichée que si la position est fraîche et le statut `EN_ROUTE`.

## 4. Adaptation au statut

| Statut | Marqueur livreur | Trajet | ETA |
| --- | --- | --- | --- |
| À affecter | non | non | non |
| Affectée | non | non | non |
| En route | oui | oui | si calculable |
| Arrivé | oui | oui | non |
| Livrée | non | tracé conservé | non |
| Échec / Annulée | non | tracé conservé | non |

## 5. Contrat d'API à implémenter

### Ingestion d'une position

```
POST /api/deliveries/:id/positions
{ "lat": 14.7225, "lng": -17.4732, "recordedAt": 1730000000000, "clientId": "uuid-v4" }
```

- `clientId` est généré par le téléphone : la requête est **idempotente**.
- `recordedAt` vient du téléphone, pas du serveur : c'est l'instant de la mesure.
- Le serveur stocke aussi `syncedAt` pour distinguer mesure et réception.

### Flux temps réel

```
GET /api/companies/:id/stream        (WebSocket)
```

Événements : `position`, `statut`, `livraison`, `preuve`, `paiement`.
Le bureau s'abonne à son entreprise ; un livreur ne peut s'abonner qu'à ses
propres missions. Aucune diffusion inter-entreprises.

### Synchronisation hors ligne

```
POST /api/sync
{ "operations": [ { "type": "POSITION" | "STATUT" | "LIVRAISON" | "PREUVE" | "PAIEMENT",
                    "clientId": "...", "recordedAt": ..., "payload": {...} } ] }
```

Chaque opération est appliquée une seule fois (clé `clientId`). La réponse
indique, pour chaque opération, si elle a été appliquée ou était déjà connue.
Le téléphone ne supprime une opération de sa file qu'après acquittement.

## 6. Sécurité et permissions

| Acteur | Portée |
| --- | --- |
| Entreprise | ses propres livreurs et livraisons (`companyId`) |
| Livreur | ses propres missions uniquement |
| Client | sa propre livraison (portail client, version ultérieure) |

- Le suivi GPS n'est **actif que pendant une opération** : entre `AFFECTEE` et
  la clôture. Aucun suivi en dehors des heures de travail.
- Toute consultation d'une position est journalisée dans `audit_logs`.
- Les preuves photo sont servies par URL signée, jamais par URL publique.

## 7. Portail client (préparé, non livré)

L'architecture permet déjà un accès restreint : le `reference` de livraison
suffit à identifier la ressource, et les mêmes fonctions de fraîcheur et d'ETA
s'appliquent telles quelles. Un jeton à portée limitée (une livraison, durée
bornée) sera ajouté lors de l'implémentation du portail.

Le portail devra afficher les mêmes états honnêtes : si la position n'est pas
fraîche, le client voit « dernière position connue », jamais un point qui bouge
sans données.

## 8. Ce qui n'est pas fait

- Pas d'API : le suivi lit des données de démonstration locales.
- Pas de WebSocket : la page se rafraîchit toutes les 5 secondes côté client.
- Pas de routage : le trajet suit les points enregistrés.
- Pas d'optimisation de tournée : hors périmètre, et sans données réelles
  suffisantes pour l'évaluer.

Ces éléments sont décrits ici pour que l'implémentation serveur n'ait pas à
redéfinir le contrat.
