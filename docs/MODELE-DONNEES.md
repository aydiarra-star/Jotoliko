# Jotoliko — Modèle de données

Source de vérité : [`prisma/schema.prisma`](../prisma/schema.prisma).
Ce document explique les décisions, pas la syntaxe.

## 1. Carte des entités

```
Company ──┬── Membership ── User
          ├── Zone ──── Customer ──── Order ──┬── OrderItem
          ├── Vehicle ── Driver              ├── Delivery ──┬── Proof
          │                 │               │              └── Payment
          │                 ├── DriverPosition│
          │                 └── Settlement ───┘
          ├── Product
          ├── AuditLog / Notification / Setting
          └── Role ── Permission
```

## 2. Décisions structurantes

### 2.1 Multi-tenant par colonne

Toutes les tables métier portent `companyId`. Ce choix est discuté dans
[ARCHITECTURE.md](ARCHITECTURE.md#3-multi-tenant). Conséquence pratique : chaque
index commence par `companyId`, car aucune requête légitime ne traverse les
entreprises.

### 2.2 Lignes de commande séparées

`Order` porte les totaux, `OrderItem` porte les lignes. C'est indispensable pour les
restaurants, le e-commerce et les grossistes, et c'est ce qui manquait au schéma
initial. Le libellé est libre (`label`) parce que la majorité des PME ciblées n'ont
pas de catalogue produit structuré. `Product` existe pour celles qui en ont un.

### 2.3 Montants en entiers

Tous les montants sont des `Int`. Le FCFA n'a pas de subdivision usuelle, et les
flottants introduisent des erreurs d'arrondi dans une application dont la raison
d'être est de réconcilier de l'argent.

### 2.4 Adressage à trois niveaux

`Customer` combine `lat`/`lng`, `landmark` (repère libre) et `zoneId`. Les trois
coexistent parce que le terrain utilise les trois. Forcer un seul mode fait
retourner les livreurs sur WhatsApp.

### 2.5 Horodatage double

Les entités créées hors ligne (`Delivery`, `Proof`, `Payment`) portent :

- `recordedAt` — heure du téléphone, au moment de l'action terrain ;
- `syncedAt` — heure d'arrivée sur le serveur.

Les rapports utilisent `recordedAt` (la réalité terrain). L'audit compare les deux
pour détecter les horloges fausses.

### 2.6 Identifiants client

`clientId` sur `Delivery`, `Proof`, `Payment` : UUID généré sur le téléphone, unique
en base. C'est ce qui rend la synchronisation idempotente — rejouer une opération ne
crée pas de doublon.

### 2.7 La caisse comme entité

`Settlement` n'est pas dérivé, il est persisté. Le cycle :

```
OPEN ──> SUBMITTED ──> VALIDATED ──> CLOSED
              └──────> DISPUTED
```

- `expectedAmount` — calculé depuis les `Payment` au statut `COLLECTED` du livreur sur la période.
- `declaredAmount` — saisi par le livreur.
- `receivedAmount` — compté par l'entreprise.
- `variance` — `receivedAmount - expectedAmount`.

La tolérance d'écart est paramétrable par entreprise (`Setting.cashVarianceTolerance`).

### 2.8 Machine à états historisée

`OrderStatusHistory` enregistre chaque transition avec l'auteur et le motif. Sans
cela, impossible de répondre à « qui a annulé cette commande, et pourquoi ? », qui
est une question quotidienne.

### 2.9 Positions GPS séparées

`DriverPosition` est une table à fort volume, isolée de `Driver` pour ne pas
alourdir les lectures courantes. Index sur `(driverId, recordedAt)`.

## 3. Volumétrie attendue

Pour une entreprise de 20 livreurs, 150 livraisons par jour :

| Table | Lignes / jour | Lignes / an |
| --- | --- | --- |
| Order | 150 | ~55 000 |
| OrderItem | ~400 | ~150 000 |
| Delivery | 150 | ~55 000 |
| Proof | ~150 | ~55 000 |
| Payment | ~140 | ~51 000 |
| DriverPosition | ~20 000 | ~7 000 000 |

`DriverPosition` est la seule table qui justifie un partitionnement par mois. Les
autres tiennent sans difficulté sur une instance PostgreSQL unique pour plusieurs
centaines d'entreprises.

## 4. Requêtes critiques

Les requêtes qui doivent rester rapides, et leurs index :

| Requête | Index |
| --- | --- |
| Commandes du jour d'une entreprise | `orders(companyId, createdAt)` |
| Commandes par statut | `orders(companyId, status)` |
| Missions d'un livreur | `deliveries(driverId, status)` |
| Caisse attendue d'un livreur | `payments(driverId)`, `payments(companyId, status)` |
| Remises ouvertes | `settlements(companyId, status)` |
| Dernière position d'un livreur | `driver_positions(driverId, recordedAt)` |

## 5. Intégrité

- Suppression en cascade depuis `Company` : supprimer une entreprise purge ses données.
- `Driver.userId` en `SetNull` : désactiver un compte ne supprime pas l'historique de livraison.
- `Order.customerId` sans cascade : on ne supprime pas une commande parce qu'un client part.
- Unicité : `orders(companyId, reference)`, `deliveries.orderId`, `settlements(companyId, reference)`.

## 6. Migration depuis l'existant

Les clients cibles gèrent aujourd'hui leurs données dans Excel. L'import doit donc
accepter, dans cet ordre :

1. Clients (nom, téléphone, adresse, zone).
2. Produits (si catalogue).
3. Commandes en cours (pour ne pas perdre le travail de la journée).

L'import est une exigence du MVP, pas une fonctionnalité secondaire : c'est la porte
d'entrée du produit.
