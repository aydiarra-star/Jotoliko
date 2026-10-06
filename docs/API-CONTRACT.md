# API contract initial

Public :
- GET /health
- POST /auth/login

Authentifié :
- GET /missions
- GET /missions/:id
- POST /missions/:id/transition
- POST /missions/:id/payment + Idempotency-Key
- POST /missions/:id/remittance + Idempotency-Key
- POST /missions/:id/gps

Le contrat est volontairement étroit : pas de fausse fonctionnalité. Les endpoints non implémentés doivent rester absents.
