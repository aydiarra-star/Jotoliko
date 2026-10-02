# Jotoliko — Architecture

## 1. Vue d'ensemble

```
┌──────────────────┐        ┌──────────────────┐
│  Console web     │        │  App livreur     │
│  Next.js 15      │        │  Flutter         │
│  (managers)      │        │  (terrain,       │
│                  │        │   hors ligne)    │
└────────┬─────────┘        └────────┬─────────┘
         │ HTTPS / JSON              │ HTTPS + file de sync
         │                           │
         ▼                           ▼
┌──────────────────────────────────────────────┐
│              API NestJS (REST)               │
│  Auth │ Orders │ Deliveries │ Payments │ ...  │
│  Guards JWT + isolation tenant                │
└────────┬──────────────────────┬──────────────┘
         │ Prisma               │ BullMQ
         ▼                      ▼
┌──────────────────┐   ┌──────────────────────┐
│  PostgreSQL      │   │  Redis               │
│  (source de      │   │  (jobs, file, cache) │
│   vérité)        │   │                      │
└──────────────────┘   └──────────────────────┘
         │
         ▼
┌──────────────────┐
│  Stockage objet  │  photos de preuve
│  (S3 / R2)       │
└──────────────────┘
```

## 2. Découpage

| Composant | Rôle | Techno |
| --- | --- | --- |
| Console web | Back-office managers, dispatching, caisse, rapports | Next.js 15, React 19, TypeScript, Tailwind |
| App livreur | Missions terrain, hors ligne, preuve photo | Flutter |
| API | Logique métier, règles, autorisation | NestJS, TypeScript |
| Base | Source de vérité relationnelle | PostgreSQL 16 |
| ORM | Accès données typé, migrations | Prisma |
| Cache et jobs | Files de traitement, rappels, exports | Redis, BullMQ |
| Stockage | Photos de preuve | S3 compatible |
| Site marketing | Vitrine, acquisition | Next.js export statique |

## 3. Multi-tenant

Chaque table métier porte `companyId`. L'isolation est appliquée dans la couche
d'accès, pas dans chaque contrôleur : un middleware résout l'entreprise depuis le
JWT et un service de base filtre systématiquement par `companyId`. Un contrôleur qui
oublie le filtre est un bug de sécurité, donc le filtre ne doit pas dépendre de la
discipline de l'auteur.

Options évaluées :

- **Base partagée, colonne `companyId`** — retenu. Coût d'exploitation faible, suffisant jusqu'à plusieurs milliers d'entreprises.
- **Schéma PostgreSQL par entreprise** — écarté pour le MVP : migrations multipliées, complexité opérationnelle.
- **Base par entreprise** — écarté : ingérable à l'échelle PME, coûteux.

## 4. API REST

Conventions :

- Préfixe `/v1`, versionnement par URL.
- Authentification `Authorization: Bearer <jwt>`.
- Pagination par curseur (`?cursor=&limit=`).
- Erreurs normalisées (`code`, `message`, `details`).
- Idempotence des écritures terrain via l'en-tête `Idempotency-Key`, adossé à `clientId`.

Ressources principales :

```
POST   /v1/auth/register
POST   /v1/auth/login
POST   /v1/auth/refresh
POST   /v1/auth/password-reset

GET    /v1/me

GET    /v1/customers            POST   /v1/customers
GET    /v1/customers/:id        PATCH  /v1/customers/:id
DELETE /v1/customers/:id

GET    /v1/drivers              POST   /v1/drivers
GET    /v1/drivers/:id          PATCH  /v1/drivers/:id
POST   /v1/drivers/:id/deactivate

GET    /v1/orders               POST   /v1/orders
GET    /v1/orders/:id           PATCH  /v1/orders/:id
POST   /v1/orders/:id/duplicate
POST   /v1/orders/:id/cancel
POST   /v1/orders/:id/assign

GET    /v1/deliveries           GET    /v1/deliveries/:id
POST   /v1/deliveries/:id/status
POST   /v1/deliveries/:id/proofs

GET    /v1/payments             POST   /v1/payments
GET    /v1/settlements          POST   /v1/settlements
POST   /v1/settlements/:id/submit
POST   /v1/settlements/:id/validate

GET    /v1/reports/daily        GET    /v1/reports/monthly
GET    /v1/reports/drivers

POST   /v1/sync/batch           # poussée groupée depuis l'app livreur
```

### Endpoint de synchronisation

L'application livreur ne fait pas un appel par action. Elle accumule les opérations
et les pousse par lot :

```json
POST /v1/sync/batch
{
  "deviceId": "…",
  "operations": [
    { "clientId": "…", "type": "delivery.status", "recordedAt": "…", "payload": { … } },
    { "clientId": "…", "type": "payment.collect", "recordedAt": "…", "payload": { … } },
    { "clientId": "…", "type": "proof.create",  "recordedAt": "…", "payload": { … } }
  ]
}
```

La réponse indique, pour chaque opération, si elle a été appliquée, ignorée
(déjà reçue) ou rejetée avec un motif. Le client peut alors purger sa file.

## 5. Temps réel

Le MVP fonctionne en interrogation périodique (30 s) sur le dashboard. Le suivi GPS
temps réel, reporté après validation, utilisera WebSocket ou SSE pour pousser les
positions. Ce choix n'affecte pas le modèle de données, déjà prévu pour.

## 6. Sécurité

- JWT d'accès courts (15 min) + jeton de rafraîchissement en cookie `HttpOnly`.
- Hachage Argon2.
- Limitation de débit sur l'authentification et la synchronisation.
- Autorisation par rôle et permission, vérifiée côté serveur uniquement.
- Journal d'audit sur toute mutation sensible.
- Validation stricte des entrées (schémas), rejet par défaut.
- Aucune donnée personnelle dans les journaux.
- Chiffrement en transit (TLS) et au repos.

## 7. Environnements

| Environnement | Usage | Hébergement |
| --- | --- | --- |
| Local | Développement | Docker Compose |
| Préproduction | Validation avant mise en production | AWS, base dédiée |
| Production | Clients | AWS (ECS ou équivalent) + RDS |

Le site marketing est servi séparément en statique (GitHub Pages, puis Vercel ou
CloudFront sur domaine propre).

## 8. Scalabilité

- L'API est sans état, donc horizontale.
- PostgreSQL : index sur `(companyId, status)` et `(companyId, createdAt)`, les
  requêtes les plus fréquentes.
- Les exports et rapports lourds passent en job asynchrone, jamais en requête HTTP.
- Les photos sont stockées hors base, uniquement l'URL en base.
- Partitionnement des positions GPS par mois si le volume le justifie.
