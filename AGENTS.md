# AGENTS.md — Jotoliko

## Nature du dépôt

Deux choses cohabitent dans ce dépôt :

1. Le **site marketing** (Next.js 15, export statique) — à la racine.
2. La **documentation produit et le modèle de données** — `docs/`, `prisma/`.

Depuis la PR #3, l'API NestJS (`apps/api/`) est également présente. Le dépôt
n'utilise **pas** npm workspaces : la racine est le site, et `apps/api` a son
propre `package.json` et son propre `package-lock.json`.
`apps/api/tsconfig.json` compile aussi `lib/jotoliko-os/` : les invariants métier
sont partagés, jamais dupliqués. La console web dédiée et l'application Flutter
restent hors du dépôt.

## Contraintes de ce dépôt (vérifiées)

### Jetons et permissions

- **Mise à jour 2026-10-15 : ce qui suivait était obsolète.** Le jeton utilisé
  depuis l'environnement Arena écrit normalement, **y compris les fichiers
  `.github/workflows/*`** : un push de branche contenant les workflows a été
  accepté (vérifié). Le workflow `deploy-pages.yml`, qui manquait dans le dépôt
  alors que ce document et le README le référençaient, a donc pu être restauré.
- Si un push de workflow est un jour rejeté, c'est un problème de droits du jeton
  du moment, pas une règle générale du dépôt.

### Déploiement

- GitHub Pages sert la branche **`gh-pages`** (source configurée sur le dépôt).
- Le site est servi sous `/Jotoliko/`, donc le build exige
  `NEXT_PUBLIC_BASE_PATH=/Jotoliko`. Sans cela, les assets renvoient 404.
- `trailingSlash` est activé : chaque route produit un dossier avec `index.html`.
- URL : https://aydiarra-star.github.io/Jotoliko/

### Build

```bash
NEXT_PUBLIC_BASE_PATH=/Jotoliko \
NEXT_PUBLIC_SITE_URL=https://aydiarra-star.github.io/Jotoliko \
npm run build
```

### Prisma

- **Ne pas installer `prisma@latest`** : `latest` pointe actuellement sur une version
  8.0 RC dont la CLI ne connaît plus `validate` ni `format`. La ligne stable utilisée
  est **6.19.3** (`prisma` et `@prisma/client` alignés).
- Valider le schéma avec une `DATABASE_URL` factice :
  `DATABASE_URL="postgresql://jotoliko:jotoliko@localhost:5432/jotoliko" npx prisma validate`
- **Un seul schéma canonique : `prisma/schema.prisma`.** L'ancien schéma parallèle
  `apps/api/prisma/schema.prisma` a été fusionné puis supprimé — il omettait
  `Settlement`, `Proof`, `Payment`, `clientId` et les métadonnées hors ligne.
  Ne pas en recréer : `jotoliko-api-ci.yml` échoue en cas de dérive entre le
  schéma et `prisma/migrations/`.
- **`prisma generate`, `validate` et `migrate` exigent le téléchargement d'un
  moteur depuis `binaries.prisma.sh`.** Si cet hôte est inaccessible (sandbox
  hors ligne), ces commandes échouent. Pour ne pas laisser l'API invérifiable :
  `node apps/api/scripts/local-prisma-stub.mjs` dérive un substitut de types
  depuis le schéma réel. Outil **local uniquement**, jamais utilisé en CI.

## Conventions

- Code et identifiants en anglais ; interface et documentation en français.
- Montants en entiers (`Int`), jamais en flottants. FCFA sans subdivision.
- Toute requête métier filtre par `companyId`.
- Toute mutation sensible écrit une ligne dans `audit_logs`.

## Décisions produit structurantes

À ne pas remettre en cause sans raison forte — elles sont argumentées dans
`docs/CAHIER-DES-CHARGES-MVP.md`.

1. **Offline-first** : identifiants générés côté client (`clientId`), horodatage
   double (`recordedAt` / `syncedAt`), opérations idempotentes, file d'attente visible.
2. **La caisse est le cœur du produit** : `Settlement` est persisté, pas dérivé.
   L'écart (`variance`) est une donnée de premier plan.
3. **Une seule cible au lancement** : les sociétés de livraison de Dakar.
4. **Le suivi GPS temps réel est hors périmètre MVP** (coût batterie/data, adhésion
   livreurs, valeur inférieure à la caisse).

## Règle d'honnêteté des données (non négociable)

Le produit et le site ne doivent **jamais** présenter comme réelle une donnée qui
ne l'est pas. Concrètement :

- Aucune position GPS inventée. Une position périmée est affichée comme telle, ou
  pas du tout. Voir `evaluerFraicheur` dans `lib/tracking.ts`.
- Aucune ETA inventée. Sans vitesse réellement mesurée, l'ETA est « indisponible ».
  Voir `calculerEta`. Il n'existe aucun paramètre de vitesse par défaut.
- Aucune route dessinée qui n'existe pas : le tracé suit les points enregistrés.
- Aucun chiffre d'amélioration marketing (« -40 % de temps ») sans mesure réelle.
- Aucun faux témoignage client. Le contenu parle de cas d'usage, et le dit.
- Toute donnée fictive porte un bandeau « Mode démonstration ».

Cette règle est testée : `lib/tracking.test.ts` couvre explicitement les cas
GPS désactivé, position ancienne, position absente, vitesse non mesurable et
statut non suivi. Toute modification de `lib/tracking.ts` doit garder ces tests
au vert.

## Conventions de code

- `lib/tracking.ts` contient la logique métier pure et testable. Elle ne doit
  dépendre ni de React ni du DOM.
- Les composants de suivi sont sous `components/tracking/`.
- La carte est chargée côté client uniquement (`next/dynamic` avec `ssr: false`),
  car Leaflet a besoin de `window`.
- Les données de démonstration sont sous `lib/demo.ts`, avec des positions
  exprimées en **minutes écoulées** et non en horodatage absolu : cela évite tout
  décalage d'hydratation dans l'export statique et garde la démo cohérente.
- Lancer les tests : `npm test`.
