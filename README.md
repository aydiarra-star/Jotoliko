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

Le workflow `.github/workflows/deploy-pages.yml` construit et publie le site sur
GitHub Pages à chaque push sur `main`. Il peut aussi être lancé manuellement depuis
l'onglet **Actions** (`workflow_dispatch`).

Prérequis : dans **Settings → Pages**, la source doit être réglée sur
**GitHub Actions**.

Variables d'environnement utilisées au build :

- `NEXT_PUBLIC_BASE_PATH` — préfixe de chemin (renseigné automatiquement par Pages,
  vide sur Vercel ou un domaine racine)
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
