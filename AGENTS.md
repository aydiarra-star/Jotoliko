# AGENTS.md — Jotoliko

## Nature du dépôt

Deux choses cohabitent dans ce dépôt :

1. Le **site marketing** (Next.js 15, export statique) — à la racine.
2. La **documentation produit et le modèle de données** — `docs/`, `prisma/`.

L'API NestJS, la console web et l'application Flutter ne sont pas encore dans ce
dépôt.

## Contraintes de ce dépôt (vérifiées)

### Jetons et permissions

Trois niveaux de jeton ont été observés, à ne pas confondre :

- Un jeton d'intégration GitHub (`ghu_`) est **en lecture seule** : l'API répond
  `403 Resource not accessible by integration` sur toute écriture. Le champ
  `permissions.push` renvoyé par l'API est trompeur : il décrit le rôle du
  compte, pas les droits du jeton.
- Un jeton personnel (`ghp_`) avec le seul scope `repo` **peut pousser du code**,
  mais GitHub refuse tout commit qui touche `.github/workflows/` :
  `refusing to allow a Personal Access Token to create or update workflow
  .github/workflows/deploy-pages.yml without 'workflow' scope`. C'est une
  protection côté GitHub, pas un problème de configuration.
- Un jeton avec le scope `workflow` en plus de `repo` peut tout pousser.

Conséquence : ne jamais inclure `.github/workflows/` dans un commit destiné à
être poussé avec un jeton sans scope `workflow`. Le fichier `deploy-pages.yml`
est versionné localement mais doit être ajouté manuellement depuis l'interface
GitHub.

Si une branche contient déjà `.github/workflows/` dans son historique, la
pousser est impossible avec un jeton sans scope `workflow`, même si le fichier
est identique côté distant. Contournement utilisé le 2026-10-01 : réécrire
l'historique dans une branche de publication dédiée.

```bash
export FILTER_BRANCH_SQUELCH_WARNING=1
git branch -f publish-site feat/marketing-site
git filter-branch -f --index-filter \
  'git rm -r --cached --ignore-unmatch .github/workflows' \
  --prune-empty -- <premier-commit>..publish-site
```

`feat/marketing-site` reste intacte : seule `publish-site` est réécrite.
Vérifier ensuite que l'écart de contenu se limite au fichier de workflow :

```bash
git diff --stat feat/marketing-site publish-site
```

Piège vérifié le 2026-10-01 : `git push --dry-run` **ne détecte pas** le rejet lié
au scope `workflow`. Le dry-run annonce le push comme accepté, puis le push réel
est rejeté. Ne pas conclure qu'un jeton dispose du scope `workflow` sur la seule
foi d'un dry-run : tenter le push réel.

### Déploiement

- GitHub Pages sert la branche **`gh-pages`** (source configurée sur le dépôt).
- Le site est servi sous `/Jotoliko/`, donc le build exige
  `NEXT_PUBLIC_BASE_PATH=/Jotoliko`. Sans cela, les assets renvoient 404.
- `trailingSlash` est activé : chaque route produit un dossier avec `index.html`.
- URL : https://aydiarra-star.github.io/Jotoliko/

Le dossier `out/` est ignoré par git (`.gitignore`). La branche `gh-pages` ne peut
donc être produite que par le workflow `deploy-pages.yml`, ou par un déploiement
manuel. Le 2026-10-01, faute de jeton disposant du scope `workflow`, la branche
`gh-pages` a été publiée manuellement :

```bash
rm -rf out
NEXT_PUBLIC_BASE_PATH=/Jotoliko \
NEXT_PUBLIC_SITE_URL=https://aydiarra-star.github.io/Jotoliko \
npm run build
touch out/.nojekyll          # sans cela, Jekyll ignore les dossiers _next
mkdir -p /tmp/ghp && cp -a out/. /tmp/ghp/
cd /tmp/ghp && git init -b gh-pages && git add -A
git -c user.name=openhands -c user.email=openhands@all-hands.dev commit -m "..."
git push --force https://<jeton>@github.com/aydiarra-star/Jotoliko.git gh-pages
```

Sauvegarder la référence précédente avant d'écraser : `git tag -f
backup-gh-pages <sha>`. Le `.nojekyll` est indispensable : sans lui, GitHub Pages
applique Jekyll et ignore `_next`, ce qui casse tous les assets.

Vérification après déploiement (compter une minute de reconstruction) :

```bash
for u in "" "app/" "secteurs/" "communication/"; do
  curl -s -o /dev/null -w "/$u -> %{http_code}\n" \
    "https://aydiarra-star.github.io/Jotoliko/$u"
done
```

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

## Règle de preuve de livraison (non négociable)

Une livraison ne peut pas être clôturée sans preuve enregistrée. La règle vit
dans le domaine (`transitionTerrain` dans `lib/domain/operations.ts`), pas dans
l'interface : un écran peut oublier de la vérifier, un appelant mobile ou un
futur backend la contournerait. Ne jamais la déplacer vers un composant.

Ordre imposé : `ARRIVE` → enregistrer la preuve → `LIVREE`. Couvert par
`lib/domain/domain.test.ts`.

## Application (`app/app/`)

- L'état vit dans le navigateur (`lib/magasin.tsx`) et survit au rechargement via
  `localStorage`. Le serveur rend un état vide, l'hydratation attend `pret`.
- Aucune règle métier dans le magasin : toutes les mutations passent par
  `lib/domain/operations.ts`.
- Les pages de détail utilisent des **paramètres de requête**
  (`/app/livraisons/detail/?id=liv-1` via `lienDetail`), jamais des routes
  dynamiques `[id]` : l'export statique ne peut pas pré-rendre ces dernières.
- Les horodatages de démonstration et l'ancre de session sont calculés **vers le
  passé** depuis l'instant courant. Ancrer à midi produisait un « aujourd'hui »
  dans le futur.
- Chaîne vérifiée de bout en bout : commande → affectation → départ → arrivée →
  preuve → livraison → encaissement → caisse → rapport.

## Import WhatsApp

- `lib/domain/whatsapp.ts` analyse un message collé et propose une commande.
  Il ne crée rien : l'écran laisse toujours relire et corriger avant création.
- Les formules de politesse et les phrases d'ouverture (« Bonjour Jotoliko »,
  « Merci ») sont écartées et listées comme telles. Ne jamais les transformer en
  ligne d'article : c'est un bug déjà corrigé, couvert par
  `lib/domain/whatsapp.test.ts`.
- Ce qui n'est pas compris est affiché dans une section « Non compris », jamais
  deviné silencieusement. Même règle d'honnêteté que pour le suivi GPS.
- Le prix unitaire n'est presque jamais dans le message : le total annoncé est
  conservé (`montantAnnonce`) et rapproché du total des lignes à l'encaissement.

## Suppression d'un client

`clientSupprimable` (`lib/domain/operations.ts`) refuse de supprimer un client
rattaché à des commandes : l'historique disparaîtrait. La règle est dans le
domaine, pas dans l'écran.

## Déploiement

`.github/workflows/deploy-pages.yml` publie `./out` sur `gh-pages` au push sur
`main` (ou via `workflow_dispatch`). Le build doit recevoir
`NEXT_PUBLIC_BASE_PATH=/Jotoliko`, sinon les assets 404.

État au 2026-10-01 : la branche `publish-site` (contenu de `feat/marketing-site`
sans `.github/workflows/`) a été poussée, et `gh-pages` a été publiée
manuellement. Le site marketing à jour et l'application sous `/app/` sont en
ligne. Le workflow `deploy-pages.yml` reste absent du dépôt distant : tant
qu'il n'y est pas, chaque publication de `gh-pages` doit être faite à la main.

Rappel de sécurité : ne jamais écrire un jeton dans `.git/config` ni dans un
fichier versionné. Pousser avec l'URL contenant le jeton en argument ponctuel :

```bash
git push "https://<jeton>@github.com/aydiarra-star/Jotoliko.git" <branche>
```
