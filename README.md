# Jotoliko — Site marketing

> **Gérez. Livrez. Encaissez.**
> Le système d'exploitation des opérations terrain en Afrique de l'Ouest.

Site vitrine et marketing de Jotoliko : landing page, fonctionnalités, solutions,
tarifs, blog, FAQ, à propos, contact et demande de démo.

## Stack

| Élément | Choix |
| --- | --- |
| Framework | Next.js 15 (App Router, export statique) |
| UI | React 19, TypeScript, TailwindCSS |
| Animations | Framer Motion |
| Icônes | lucide-react |
| Police | Inter (next/font) |
| Hébergement | GitHub Pages (statique) / Vercel |

## Design system

- Bleu profond `#0F172A` (ink)
- Bleu électrique `#2563EB` (brand)
- Vert succès `#10B981` (success)
- Blanc `#FFFFFF`, gris `#F8FAFC` (surface)
- Police Inter, responsive mobile-first, micro-interactions Framer Motion

Les tokens sont définis dans `tailwind.config.ts` et les utilitaires de composants
(`.btn`, `.card`, `.shell`, `.eyebrow`) dans `app/globals.css`.

## Démarrage

```bash
npm install
npm run dev        # http://localhost:3000
```

## Build statique

```bash
npm run build      # génère ./out
npm run start      # sert ./out en local
```

Le site est exporté en HTML statique (`output: "export"`). `trailingSlash` est activé
pour que chaque route corresponde à un dossier et un `index.html`, ce qui est requis
par GitHub Pages.

## Déploiement

Le site est publié sur GitHub Pages depuis la branche **`gh-pages`** :

**https://aydiarra-star.github.io/Jotoliko/**

GitHub Pages est configuré sur ce dépôt avec `gh-pages` comme source
(Settings → Pages → Source = Deploy from a branch → `gh-pages` / `root`).
Aucun workflow GitHub Actions n'est requis.

Pour republier après une modification :

```bash
NEXT_PUBLIC_BASE_PATH=/Jotoliko \
NEXT_PUBLIC_SITE_URL=https://aydiarra-star.github.io/Jotoliko \
npm run build

# publier ./out sur la branche gh-pages
git worktree add --detach /tmp/ghpages
cd /tmp/ghpages
git checkout --orphan gh-pages
git rm -r --cached .
cp -r /path/to/repo/out/. .
touch .nojekyll
git add -A && git commit -m "Publish site"
git push origin gh-pages
```

`NEXT_PUBLIC_BASE_PATH` doit valoir `/Jotoliko` car le site est servi depuis un
sous-chemin. Sur un domaine racine (Vercel, domaine personnalisé), laissez-le vide.

Variables d'environnement utilisées au build :

- `NEXT_PUBLIC_BASE_PATH` — préfixe de chemin
- `NEXT_PUBLIC_SITE_URL` — URL canonique utilisée par les métadonnées, `sitemap.xml`
  et `robots.txt`

## Structure

```
app/
  layout.tsx              layout racine, métadonnées SEO, Navbar/Footer
  page.tsx                landing page
  fonctionnalites/        index + [slug] des modules produit
  solutions/              segments clients
  tarifs/                 grille tarifaire
  blog/                   index + [slug] des articles
  a-propos/ contact/ demo/ faq/
  sitemap.ts robots.ts not-found.tsx
components/
  landing/dashboard-mockup.tsx   maquette de dashboard animée
  ui/                     navbar, footer, section, reveal, accordion, formulaire
lib/
  content.ts              contenu éditorial et configuration du site
  posts.ts                articles de blog
  utils.ts                helpers
```

## SEO

- Métadonnées par page (`generateMetadata`), Open Graph et Twitter Cards
- `sitemap.xml` et `robots.txt` générés au build
- Données structurées JSON-LD (`FAQPage`, `BlogPosting`)
- `lang="fr"`, HTML sémantique, lien d'évitement clavier, `prefers-reduced-motion`

## Accessibilité

Navigation clavier complète, focus visibles, contrastes conformes, alternatives
textuelles sur les icônes décoratives, respect de `prefers-reduced-motion`.
