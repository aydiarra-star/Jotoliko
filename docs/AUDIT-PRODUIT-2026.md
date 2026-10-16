# Jotoliko — Audit produit 2026

## Constat
Le dépôt public historique est principalement une vitrine marketing. Le chantier 2026 introduit une vraie fondation opérationnelle, mais ne doit pas être confondu avec un SaaS production-ready.

## P0
- Vérité des données : aucun faux temps réel, ETA ou KPI.
- Isolation entreprise : toutes les lectures métier de l'API sont company-scoped.
- Encaissement : interdit avant LIVREE.
- Livraison : preuve exigible avant clôture.
- Remise : séparée de l'encaissement et limitée au montant disponible.
- Mutations financières : idempotence obligatoire.
- GPS : position datée et niveau de vérité calculé.

## P1
- Authentification API signée avec secret serveur et expiration.
- RBAC initial : OWNER / ADMIN / MANAGER / DRIVER / SELLER / VIEWER.
- Audit des transitions, encaissements, remises et GPS.
- API NestJS + Prisma/PostgreSQL.
- Interface opérationnelle Responsable / Livreur / Vendeur explicitement en mode démonstration tant que l'API n'est pas connectée.

## P2
- Stockage objet des preuves.
- synchronisation offline complète des événements terrain.
- tournées/optimisation.
- notifications WhatsApp/SMS/email.
- portail client de suivi.
- import CSV/Excel et connecteurs.

## Verdict actuel
**NOT READY FOR PRODUCTION.** Fondation API réelle en place, mais déploiement PostgreSQL, secrets, stockage de preuves, tests e2e et synchronisation complète restent à valider.
