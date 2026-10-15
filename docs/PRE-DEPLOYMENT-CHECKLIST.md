# Jotoliko — checklist d'exécution avant paiement

**État au 15 octobre 2026.** Document de travail pour terminer les contrôles réalisables sans achat. Il ne prouve pas qu'un service externe est provisionné.

## Règles non négociables

- Aucun achat, abonnement ou compte payant sans autorisation explicite.
- Aucune fusion de PR, publication en production ou migration destructive sans autorisation.
- Ne jamais réutiliser les identifiants de démonstration de `docker-compose.yml` en production.
- Ne jamais mettre de secrets dans Git, les tickets, les journaux ou les captures d'écran.
- Sauvegarder ensemble PostgreSQL et le volume `PROOF_STORAGE_DIR`; une sauvegarde SQL seule ne restaure pas les fichiers de preuve.
- Le site statique et l'API sont deux déploiements distincts. L'API ne doit pas être exposée sans TLS, secrets corrects et configuration CORS stricte.

## État des six chantiers

| # | Chantier | Déjà présent | À faire avant de le déclarer terminé |
|---|---|---|---|
| 1 | Validation du code | La CI de la PR #4 a été vérifiée verte sur le commit `a72799109ff3a2c9077db81bc07edce5ec5b836d` (5/5 jobs), avec tests HTTP E2E sur PostgreSQL 16. | Rejouer la CI après tout nouveau changement; examiner les 12 avis npm audit avant une mise à niveau majeure. |
| 2 | Préparation de l'hébergement | Architecture et variables documentées dans `docs/DEPLOYMENT-ARCHITECTURE.md`. | Choisir un fournisseur uniquement après vérification du paiement annuel, du coût de renouvellement, de la région, du stockage persistant et de la sortie/réversibilité. Créer ensuite un staging isolé, sans données réelles. |
| 3 | Domaine et site | Frontend Next.js exporté statiquement; l'URL du site est configurable. | Choisir un nom disponible, vérifier son prix de renouvellement, puis configurer DNS/HTTPS. Aucun domaine n'est acheté à ce stade. Tester la construction et l'URL du site hors GitHub Pages avant de basculer. |
| 4 | Sauvegardes et restauration | `ops/backup.mjs` et `ops/restore-verify.mjs` existent et sont exercés en CI sur des données de test. | Configurer une destination indépendante, le chiffrement et la planification; sauvegarder base + preuves; restaurer en staging et vérifier les empreintes. Les tests CI ne sont pas une sauvegarde réelle. |
| 5 | Contrôle et alertes | `/health`, `/health/live`, `/health/ready` et `ops/healthcheck.mjs` existent. | Désigner le destinataire des alertes, configurer un canal réel et prouver les états disponible/dégradé/indisponible. Ajouter un accès d'administration uniquement si les écrans existants le permettent; ne pas supposer qu'un panneau de supervision existe déjà. |
| 6 | Recette opérationnelle | Tests automatisés et procédures de contrôle présents. | Après création du staging : tester sur un vrai téléphone et réseau faible, comptes et rôles, cloisonnement des entreprises, téléversement/lecture de preuves, erreurs, redémarrage et restauration. Utiliser uniquement des données de test. |

## Pré-vol local, sans déploiement

Depuis une copie locale du dépôt, avec Node.js et les dépendances déjà installées :

```bash
npm run typecheck
npm run api:typecheck
npm run ops:typecheck
npm test
npm run api:build
npm run api:smoke
npm run build
```

Ces commandes contrôlent la copie locale; elles ne remplacent ni la CI PostgreSQL, ni un test de staging. Si une commande échoue, arrêter et diagnostiquer avant toute publication.

## Conditions de staging

L'environnement de staging doit avoir ses propres ressources et secrets :
- PostgreSQL dédié et URL `DATABASE_URL`;
- `AUTH_SECRET` généré spécifiquement pour cet environnement (32 caractères minimum);
- `CORS_ORIGIN` limité aux origines exactes du site de staging;
- `TRUST_PROXY_HOPS` réglé selon la topologie réellement utilisée;
- `PROOF_STORAGE_DIR` monté sur un volume persistant;
- destination de sauvegarde distincte du serveur;
- TLS et accès d'administration limité;
- procédure de restauration et journal du résultat.

Ne pas publier de fichier `.env` rempli. `.env.example` sert uniquement de référence sans secrets.

## Décisions qui doivent rester humaines

- Rétention des preuves, traitement des litiges et autorité de purge : aucune durée ne doit être inventée.
- Hors ligne : le produit n'a pas encore de PWA/offline-first démontré; la clôture et la preuve nécessitent actuellement le réseau.
- Encaissement : aucun fournisseur de paiement n'a confirmé un paiement réel; le flux déclaratif ne doit pas être présenté comme une intégration bancaire.
- Hébergement : le plafond visé est de 100 €/an, mais le paiement annuel en une seule fois, le coût de renouvellement et le coût réel des sauvegardes doivent être confirmés avant engagement.

## Critère de sortie

Les six chantiers ne sont pas « terminés » parce que cette checklist est remplie. Chacun doit être accompagné d'une preuve : lien CI, configuration sans secret, journal de déploiement de staging, résultat de restauration, réception d'une alerte ou rapport de recette. Production reste bloquée jusqu'à validation explicite.
