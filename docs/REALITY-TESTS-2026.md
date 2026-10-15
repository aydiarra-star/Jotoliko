# Reality tests 2026 — état réellement observé

> Ce document remplace la liste d'intentions précédente par les **résultats
> observés**. Chaque ligne indique où le test s'exécute et ce qui a réellement
> été constaté. Aucun test n'est déclaré « vert » sans exécution.

Dernière exécution : branche `arena/dd76021f-jotoliko`.
Commande : `npm test` (racine) — **106 réussis, 1 ignoré, 0 échec** sur 4 fichiers.

## Comment exécuter

| Cible | Commande | Base de données |
| --- | --- | --- |
| Suite complète | `npm test` | PostgreSQL 16 embarqué (PGlite/WASM), aucune dépendance externe |
| Base de données seule | `npm run test:db` | idem |
| Concurrence réellement parallèle | `DATABASE_URL=... npm test` | PostgreSQL 16 externe (conteneur CI) |
| Typecheck site | `npm run typecheck` | — |
| Typecheck + build API | `npm run api:typecheck && npm run api:build` | — |

Les tests marqués **CI uniquement** sont *ignorés* en local, pas simulés : un
test ignoré est visible, un test simulé mentirait.

## Points obligatoires

| # | Exigence | Où | Résultat observé |
| --- | --- | --- | --- |
| 1 | L'entreprise A ne lit jamais les missions de B | `database.reality.test.ts` | ✅ 4 tests : filtrage par `companyId`, accès direct par identifiant, référence métier réutilisable, unicité par entreprise |
| 2 | Un jeton expiré est refusé | `domain.reality.test.ts` | ✅ 8 tests : expiré, signature altérée, autre secret, charge utile re-signée, révocation, horloge future, entrées malformées |
| 3 | Un rôle `DRIVER` ne peut pas effectuer une remise | `domain.reality.test.ts` | ✅ 3 tests : matrice de permissions, `VIEWER` sans écriture, couverture des rôles |
| 4 | Paiement avant `LIVREE` refusé | `domain.reality.test.ts` | ✅ 2 tests : 5 statuts interdits, accepté après `LIVREE` |
| 5 | Livraison exige sa preuve quand la politique l'impose | `domain.reality.test.ts` | ✅ 3 tests : sans preuve refusé, avec preuve accepté, politique désactivée |
| 6 | Remise supérieure au disponible refusée | `domain.reality.test.ts` | ✅ 4 tests : plafond, limite exacte, sans encaissement, montants invalides |
| 7 | Répéter une clé d'idempotence ne double pas l'encaissement | `database.reality.test.ts` | ✅ 3 tests : contrainte d'unicité, clé partagée entre entreprises, cloisonnement par opération |
| 8 | Une position GPS trop ancienne est indisponible | `domain.reality.test.ts` | ✅ 3 tests : bornes 60 s / 900 s, entrées incohérentes, horodatage trop ancien ou futur |
| 9 | Coordonnées hors limites rejetées | `domain.reality.test.ts` + base | ✅ 3 tests domaine (dont bornes exactes) + 1 test SQL (`CHECK` moteur) |
| 10 | Une transition de statut interdite est refusée | `domain.reality.test.ts` | ✅ 4 tests : `EN_ROUTE → LIVREE` refusé, parcours nominal, `RETOUR` terminal, reprogrammation |
| 11 | Une mutation métier produit un événement d'audit | `database.reality.test.ts` | ✅ 3 tests : avant/après + `requestId`, aucun audit si la transaction est annulée, trace conservée après suppression de l'utilisateur |
| 12 | Les migrations fonctionnent sur une base propre | `database.reality.test.ts` | ✅ 4 tests : tables, types énumérés, rejeu refusé, **garde-fou anti-dérive schéma ⇄ migration** |
| 13 | Les opérations concurrentes ne corrompent pas les montants | `database.reality.test.ts` | ⚠️ 5 tests exécutés + 1 **CI uniquement** : les `CHECK` et l'atomicité transactionnelle sont vérifiés localement ; l'entrelacement de deux connexions simultanées exige un vrai serveur (`DATABASE_URL`), il est donc ignoré en local |
| 14 | Pas d'accès aux preuves d'une autre entreprise | `database.reality.test.ts` | ✅ 1 test : la référence de preuve n'est restituée qu'à l'entreprise propriétaire |
| 15 | Une erreur réseau ne perd pas silencieusement une opération | `domain.reality.test.ts` | ✅ 7 tests : conservation après échec, aucune confirmation sans accusé serveur, pas de doublon, reprise, horodatage appareil ≠ serveur |
| 16 | Les parcours principaux fonctionnent de bout en bout | `database.reality.test.ts` | ✅ 2 tests : affectation → livraison → encaissement → remise avec caisse explicable ligne à ligne ; clôture inter-entreprises refusée |

## Tests supplémentaires (au-delà de la liste obligatoire)

- **Garde-fou anti-dérive** : le test #12 lit `prisma/schema.prisma`, extrait
  chaque modèle couvert et chaque colonne scalaire, et vérifie leur existence
  dans la base migrée. C'est ce qui empêche la réapparition d'un schéma parallèle
  non migré — cause exacte de la panne de build d'origine.
- **Plafonds d'encaissement** (3 tests) : reste dû, mission soldée, plafond jamais négatif.
- **Cohérence de caisse** (3 tests) : séparation manque à encaisser / espèces
  détenues / écart, encaissement excédentaire exposé et non écrasé.
- **Validation des statuts reçus** (1 test) : rejet des chaînes non conformes.
- **Clés d'idempotence** (2 tests).
- **Périmètre utilisateur** (3 tests) : un livreur n'agit que sur ses missions.

## Limites explicites

1. **Concurrence locale** : PGlite est mono-connexion. Le test #13 d'entrelacement
   réel est ignoré en local et exécuté en CI sur un conteneur `postgres:16`.
   Les garanties locales portent sur les contraintes `CHECK`, `UNIQUE` et
   l'atomicité transactionnelle, qui sont bien appliquées par le moteur.
2. **Tests HTTP de l'API** : aucun test de bout en bout via HTTP n'existe. Les
   règles d'autorisation sont testées au niveau du domaine partagé, et les
   contraintes au niveau de la base ; la couche contrôleur NestJS n'est pas
   couverte par des tests. **C'est la principale lacune de test restante.**
3. **Génération Prisma en local** : l'hôte `binaries.prisma.sh` est inaccessible
   dans l'environnement d'audit, donc `prisma generate` / `prisma migrate` ne
   peuvent pas y être exécutés. Ils le sont en CI. Voir le rapport de release.
