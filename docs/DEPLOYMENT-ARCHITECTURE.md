# Deployment architecture

## Staging
Next.js public → API NestJS → PostgreSQL.
Preuve média → stockage objet privé.
Secrets → gestionnaire de secrets du fournisseur.
Logs → agrégés côté serveur.

## Production
Ajouter WAF/rate limiting, sauvegardes PostgreSQL, rotation secrets, monitoring, alerting et plan de restauration testé.

**Le site GitHub Pages ne doit pas être considéré comme le backend.**
