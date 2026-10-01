# AGENTS.md — Jotoliko

## Nature du dépôt

Deux choses cohabitent dans ce dépôt :

1. Le **site marketing** (Next.js 15, export statique) — à la racine.
2. La **documentation produit et le modèle de données** — `docs/`, `prisma/`.

L'API NestJS, la console web et l'application Flutter ne sont pas encore dans ce
dépôt.

## Contraintes de ce dépôt (vérifiées)

### Jetons et permissions

- Le jeton d'intégration injecté (`GITHUB_TOKEN`, préfixe `ghu_`) est **en lecture
  seule** sur `aydiarra-star/Jotoliko`. L'API répond `403 Resource not accessible by
  integration` sur toute écriture (`git/refs`, `contents`). Le champ
  `permissions.push` renvoyé par l'API est trompeur : il décrit le rôle du compte,
  pas les droits du jeton.
- **Les fichiers `.github/workflows/*` ne peuvent pas être poussés sans un jeton
  ayant le scope `workflow`.** GitHub rejette le push, même via l'API Contents.
  C'est une protection côté GitHub, pas un problème de configuration.
- Conséquence : ne jamais inclure `.github/workflows/` dans un commit destiné à être
  poussé avec un jeton sans scope `workflow`. Le fichier `deploy-pages.yml` est
  versionné localement mais doit être ajouté manuellement depuis l'interface GitHub.

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
