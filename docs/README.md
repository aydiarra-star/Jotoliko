# Jotoliko — Documentation

> **Gérez. Livrez. Encaissez.**

## Par où commencer

| Document | À lire si vous voulez… |
| --- | --- |
| [CAHIER-DES-CHARGES-MVP.md](CAHIER-DES-CHARGES-MVP.md) | Comprendre le périmètre, la cible et les décisions produit |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Comprendre la stack, le multi-tenant, l'API et le hors ligne |
| [MODELE-DONNEES.md](MODELE-DONNEES.md) | Comprendre les tables, les relations et les choix de modélisation |
| [WIREFRAMES.md](WIREFRAMES.md) | Voir les écrans clés et les principes UX |
| [SUIVI-LIVRAISON.md](SUIVI-LIVRAISON.md) | Comprendre le suivi de livraison, la fraîcheur des positions et le contrat d'API |
| [../prisma/schema.prisma](../prisma/schema.prisma) | Voir le schéma exécutable |

## Résumé du projet

Jotoliko est un logiciel SaaS, pas un service de livraison. Il centralise les
commandes, les livreurs, les tournées, les preuves de livraison, les encaissements et
les rapports des entreprises africaines qui opèrent sur le terrain.

Marché de lancement : **Sénégal**. Expansion : Côte d'Ivoire, Mali, Bénin, Togo,
Guinée, Cameroun.

## Les trois décisions qui comptent

Le reste du projet découle de ces trois choix, documentés en détail dans le cahier
des charges.

**1. Offline-first.** Le téléphone du livreur détient l'état local de ses missions.
Le serveur reçoit plus tard. Sans cela, chaque zone blanche devient une perte sèche.

**2. La caisse est le cœur du produit.** Le problème réel n'est pas de suivre un
livreur sur une carte, c'est de savoir combien d'argent est rentré et qui le détient
encore. La remise de caisse est une entité de premier plan.

**3. Une seule cible au lancement.** Les sociétés de livraison de Dakar. Les autres
segments — restaurants, pharmacies, e-commerce, boutiques — sont servis par le même
socle mais ne pilotent pas la conception du MVP.

## État d'avancement

| Livrable | État |
| --- | --- |
| Site marketing | Livré — https://aydiarra-star.github.io/Jotoliko/ |
| Cahier des charges MVP | Livré |
| Architecture | Livrée |
| Modèle de données (Prisma) | Livré |
| Wireframes et principes UX | Livrés |
| Environnement local (Docker) | Livré |
| API NestJS | À venir |
| Console web | À venir |
| Application livreur Flutter | À venir |
| Maquettes haute fidélité | À venir |
| Tests | À venir |
| Déploiement production | À venir |

## Démarrage local

```bash
docker compose up -d          # PostgreSQL + Redis
npm install
npx prisma migrate dev        # applique le schéma
```

## Conventions

- Code et identifiants en anglais, interface et documentation en français.
- Montants en entiers, jamais en flottants.
- Toute requête métier filtre par `companyId`.
- Toute mutation sensible écrit une ligne d'audit.
