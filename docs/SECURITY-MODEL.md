# Security model

- Authentification côté serveur uniquement.
- Aucun secret dans le frontend.
- Bearer signé, durée limitée.
- Toutes les ressources métier sont filtrées par companyId.
- 404 pour une ressource hors périmètre afin de limiter la fuite d'existence.
- RBAC côté API, jamais uniquement dans l'UI.
- Audit des mutations sensibles.
- Montants validés côté serveur.
- Idempotence pour les mutations financières.
- Preuves : aucun stockage base64 définitif recommandé ; utiliser un stockage objet privé avec URL signée.
