# Offline sync

Le principe est **event-first** : une action terrain doit posséder un identifiant d'idempotence avant d'être rejouée.

État minimal :
- EN_ATTENTE
- SYNCHRONISATION
- SYNCHRONISE
- ECHEC

Le serveur ne doit jamais appliquer deux fois une mutation portant le même Idempotency-Key dans la même entreprise et opération.

La première version API protège déjà les mutations financières encaissement/remise. La file offline complète reste à construire avec stockage local, retry/backoff, conflit et observabilité.
