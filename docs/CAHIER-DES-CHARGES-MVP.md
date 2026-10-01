# Jotoliko — Cahier des charges MVP

> **Gérez. Livrez. Encaissez.**
> Version 1.0 — Périmètre Sénégal

## 1. Objectif du MVP

Prouver qu'une entreprise sénégalaise qui livre avec paiement à la livraison peut
piloter ses opérations quotidiennes depuis Jotoliko, et y revenir le lendemain.

Le MVP n'est pas une version réduite du produit final. C'est la plus petite
tranche verticale qui produit de la valeur chaque jour, de bout en bout :

**commande → affectation → livraison → preuve → encaissement → remise de caisse → rapport du jour**

Tout ce qui ne sert pas cette boucle est hors périmètre.

## 2. Cible de lancement

Une seule cible au lancement : **les sociétés de livraison de Dakar** (5 à 40 livreurs).

Pourquoi elle et pas les autres :

- C'est la cible qui vit le problème de caisse le plus douloureux, donc celle qui paie.
- Elle a des livreurs salariés ou commissionnés, donc une autorité pour imposer l'outil.
- Elle livre pour les restaurants, pharmacies et boutiques — ces segments deviennent des clients indirects, puis directs en V2.

Restaurants, pharmacies, e-commerce et boutiques Instagram sont servis par le même
socle, mais ne sont pas la cible des pilotes.

## 3. Contraintes structurantes

Ces contraintes sont des exigences, pas des préférences.

| Contrainte | Conséquence sur le produit |
| --- | --- |
| Connexion instable | L'application livreur fonctionne intégralement hors ligne |
| Paiement à la livraison dominant | La caisse est une entité de premier plan, pas un champ |
| Adressage imprécis | Point GPS + repère libre + bouton d'appel, les trois ensemble |
| Android d'entrée de gamme | Application légère, écran unique, peu de data |
| Adoption en une journée | Vocabulaire métier, aucun jargon technique |
| PME peu digitalisées | Import Excel obligatoire, export toujours disponible |

## 4. Décision d'architecture : offline-first

C'est la décision la plus lourde du projet. Elle se prend maintenant ou coûte une refonte.

**Principe.** Le téléphone du livreur détient l'état local de ses missions. Le serveur
reçoit les changements plus tard. Le livreur n'attend jamais le réseau pour travailler.

**Mise en œuvre.**

1. **Identifiants côté client.** Toute entité créée sur le terrain (livraison,
   preuve, paiement) reçoit un UUID généré sur le téléphone. Le serveur ne l'attribue
   jamais. Champs `clientId` dans le modèle de données.
2. **Opérations idempotentes.** Une même déclaration rejouée ne crée pas de doublon.
   L'unicité est portée par `clientId`.
3. **Horodatage double.** `recordedAt` (heure du téléphone, terrain) et `syncedAt`
   (heure serveur). Les rapports utilisent `recordedAt`, l'audit utilise les deux.
4. **File d'attente visible.** L'application affiche en permanence le nombre
   d'opérations en attente d'envoi. L'utilisateur doit savoir où il en est.
5. **Règle de conflit explicite.** Si le bureau annule une commande pendant que le
   livreur la déclare livrée, la livraison terrain est enregistrée et l'anomalie est
   remontée pour arbitrage humain. Aucune donnée n'est silencieusement écrasée.

**Hors ligne, l'application livreur permet :** consulter ses missions, appeler le
client, ouvrir le GPS, déclarer une livraison, prendre la photo, saisir le montant
encaissé.

## 5. Décision produit : la caisse

La question que se pose le patron chaque soir n'est pas « combien de commandes ? »
mais « combien est réellement rentré, et qui détient encore l'argent ? ».

Le MVP modélise donc explicitement :

- ce que le livreur **a encaissé** (`Payment.amount`, statut `COLLECTED`) ;
- ce qu'il **doit reverser** (`Settlement.expectedAmount`) ;
- ce qu'il **déclare** (`Settlement.declaredAmount`) ;
- ce que l'entreprise **compte** (`Settlement.receivedAmount`) ;
- **l'écart** (`Settlement.variance`), avec une tolérance paramétrable.

Un écart de 500 FCFA enregistré et expliqué vaut mieux qu'un écart de 50 000 FCFA
découvert trois semaines plus tard.

## 6. Périmètre fonctionnel du MVP

### 6.1 Authentification et comptes

- Inscription d'une entreprise, création du compte propriétaire.
- Connexion par email ou téléphone, JWT avec rafraîchissement.
- Réinitialisation de mot de passe.
- Rôles : Propriétaire, Manager, Dispatcher, Comptable, Livreur.
- Isolation stricte par entreprise sur chaque requête.

### 6.2 Dashboard

- Commandes du jour, livraisons terminées, en tournée.
- Chiffre d'affaires encaissé du jour.
- Caisse à reverser par livreur.
- Alertes : retards, écarts de caisse, livraisons échouées.

### 6.3 Clients

- Créer, modifier, désactiver.
- Téléphone comme identifiant pratique (recherche par numéro).
- Adressage : zone, point GPS, repère libre.
- Historique des commandes par client.

### 6.4 Livreurs

- Créer, modifier, désactiver.
- Matricule interne, téléphone, véhicule.
- Compte d'accès à l'application livreur.
- Disponibilité et charge en cours.

### 6.5 Commandes

- Créer avec lignes d'articles (libellé libre, quantité, prix).
- Modifier tant que non livrée.
- Dupliquer une commande récurrente.
- Annuler avec motif tracé.
- Machine à états explicite et historisée.

### 6.6 Affectation et tournées

- Affecter une commande à un livreur.
- Regrouper plusieurs livraisons en tournée ordonnée.
- Réaffecter en un geste.
- Voir la charge de chaque livreur avant d'affecter.

### 6.7 Application livreur

- Liste des missions du jour, ordonnée.
- Appeler le client en un tap.
- Ouvrir le GPS vers l'adresse.
- Déclarer : livrée, échouée (avec motif).
- Fonctionne hors ligne.

### 6.8 Preuve de livraison

- Photo obligatoire si activée dans les paramètres.
- Nom du réceptionnaire.
- Horodatage et position.
- Consultable depuis la fiche commande.

### 6.9 Encaissements et remise de caisse

- Saisie du montant collecté et du mode de paiement.
- Calcul automatique de la caisse attendue par livreur.
- Déclaration de remise par le livreur.
- Validation et comptage par l'entreprise.
- Mise en évidence des écarts au-delà de la tolérance.

### 6.10 Rapports

- Rapport journalier : commandes, livraisons, encaissements, écarts.
- Rapport mensuel : volumes, chiffre d'affaires, performance par livreur.
- Export PDF et Excel.

### 6.11 Hors périmètre MVP

Explicitement reporté : suivi GPS temps réel sur carte, notifications WhatsApp et
SMS automatiques, intégrations Wave / Orange Money / Free Money, portail client,
API publique, fonctionnalités IA.

Le suivi GPS temps réel est le report le plus discuté. Il coûte cher en batterie, en
data et en adhésion des livreurs, et il rapporte moins que la caisse. Il sera
construit après validation terrain.

## 7. Machine à états des commandes

```
DRAFT ──> CONFIRMED ──> ASSIGNED ──> PICKED_UP ──> IN_TRANSIT ──> DELIVERED
              │              │            │              │
              └──────────────┴────────────┴──────────────┴──> CANCELLED
                                          │
                                          └──> FAILED ──> (réaffectation possible)
```

Règles :

- Seule une commande `DELIVERED` peut être marquée payée.
- `CANCELLED` exige un motif.
- `FAILED` exige un motif et autorise une nouvelle affectation.
- Chaque transition écrit une ligne dans `order_status_history`.

## 8. Indicateurs de succès

Le MVP est validé si, après 30 jours chez 3 pilotes :

| Indicateur | Cible |
| --- | --- |
| Livraisons enregistrées dans Jotoliko | > 90 % des livraisons réelles |
| Écarts de caisse non expliqués | < 1 % du montant encaissé |
| Temps de clôture de caisse | < 15 minutes par livreur |
| Adoption livreurs | > 80 % d'utilisation quotidienne |
| Commandes saisies hors ligne | mesuré, sans perte de donnée |

Si les écarts de caisse non expliqués ne baissent pas, le produit ne résout pas le
problème principal et le positionnement doit être revu.

## 9. Sécurité et conformité

- Données isolées par entreprise, appliqué au niveau de la couche d'accès.
- Mots de passe hachés (Argon2), JWT courts avec rafraîchissement.
- Journal d'audit sur toute action sensible.
- Géolocalisation de salariés : consentement explicite, finalité déclarée, et
  politique de conservation documentée. Loi sénégalaise 2008-12 et CDP.
- Aucune donnée personnelle dans les journaux applicatifs.
- Export et suppression des données à la demande du client.

## 10. Séquencement

| Phase | Durée | Contenu |
| --- | --- | --- |
| 0 | 2 à 4 semaines | 3 à 5 pilotes signés, observation terrain, aucun code |
| 1 | 6 semaines | Socle : auth, tenants, commandes, clients, livreurs, affectation |
| 2 | 6 semaines | Application livreur hors ligne, preuve de livraison |
| 3 | 4 semaines | Encaissements, remise de caisse, rapports |
| 4 | 2 semaines | Import Excel, export PDF, durcissement, mise en production |

La phase 0 n'est pas optionnelle. Construire sans avoir observé une journée réelle
chez un pilote est la façon la plus rapide de construire le mauvais produit.
