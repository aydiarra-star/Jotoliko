# Reality tests 2026

## Tests obligatoires avant staging
- entreprise A ne lit aucune mission de B.
- token expiré refusé.
- rôle DRIVER ne peut pas effectuer une remise.
- paiement avant LIVREE refusé.
- LIVREE sans preuve refusée si preuve obligatoire.
- remise > encaissé disponible refusée.
- répétition du même Idempotency-Key ne double pas l'encaissement.
- GPS daté > 15 min devient indisponible.
- coordonnées hors limites refusées.
- transition interdite refusée.
- audit créé après mutation métier.

## Test terrain
- réseau coupé avant action.
- action reprise après reconnexion.
- doublon envoyé après reconnexion.
- horodatage appareil conservé.
- preuve conservée avec identifiant stable.
