# Modèle backend

Noyau actuel :
- Company
- User
- Mission
- AuditEvent
- MutationKey

Mission conserve identité client, adresse africaine (quartier/zone/repère/instructions), statut, GPS daté et états financiers.

La finance distingue :
**attendu → encaissé → remis → écart**.

La prochaine évolution doit extraire les événements financiers immuables dans un ledger dédié sans casser le modèle de mission.
