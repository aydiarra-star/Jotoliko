# Jotoliko — Audit produit, UX et conversion

Audit mené sur le dépôt et sur le site en ligne, pas sur le brief. Chaque constat
est vérifié dans le code ou dans la page servie. Les livrables 1 à 8 du brief
d'audit sont couverts ici ; les livrables 9 et 10 dans
`docs/STRATEGIE-CROISSANCE.md`.

## 1. Ce qui est déjà fort

- **Positionnement appliqué.** La FAQ répond « Jotoliko est-il un service de
  livraison ? Non. Jotoliko est un logiciel. » L'accroche du hero reprend la
  phrase cible. Le point 8 du brief est déjà satisfait.
- **Différenciation par la caisse.** La section « Le cash tracé jusqu'à la
  remise » est en accueil, et le domaine la soutient réellement : `Settlement`
  persisté, écart en donnée de premier plan, justification d'écart tracée dans
  l'audit, clôture de journée par livreur.
- **Design system.** Palette conforme, Inter, Framer Motion via `Reveal`,
  navigation mobile fonctionnelle, mockup animé. Niveau visuel tenu.
- **Socle produit.** 209 tests, machine à états des commandes, isolation
  multi-entreprises, règle de preuve de livraison dans le domaine,
  offline-first.
- **Règle d'honnêteté.** C'est un actif commercial, pas une contrainte : elle
  inspire confiance à un dirigeant, là où un « -40 % de temps » inventé la
  détruit.

## 2. Audit conversion — le point critique

| Défaut | Preuve | Gravité |
| --- | --- | --- |
| Le formulaire est un `mailto:` | `components/ui/lead-form.tsx` construit un lien `mailto:` et ouvre le client mail | **Bloquant** : sur mobile, abandon quasi systématique |
| Coordonnées fictives | `contact@jotoliko.com`, `+221 77 000 00 00`, WhatsApp `+221770000000` | **Bloquant** : aucun lead ne peut aboutir |
| Application inaccessible | `https://aydiarra-star.github.io/Jotoliko/app/` renvoie 404 | **Élevé** : la promesse « démo sur vos données » n'est pas tenable |
| « Commencer gratuitement » sans offre gratuite | Le CTA menait à `/tarifs`, où le plan le moins cher est à 15 000 FCFA/mois | **Élevé** : corrigé dans ce lot |
| Aucune preuve visuelle du produit | Le mockup est statique ; pas de lien vers une session de démonstration | Moyen |

### Test A/B/C des CTA

Les trois variantes du brief n'ont pas la même fonction : ce n'est donc pas un
test comparable.

| Variante | Type d'engagement | Verdict |
| --- | --- | --- |
| « Demander une démo » | Fort, implique un rendez-vous | CTA principal recommandé |
| « Voir Jotoliko en action » | Faible, implique de montrer | CTA secondaire, à pointer vers l'application publiée |
| « Tester gratuitement » | Suppose un libre-service qui n'existe pas | À retirer jusqu'à ce qu'une offre gratuite existe |

Séquence recommandée : montrer avant de demander un rendez-vous.

## 3. Audit UX et UI

- Navigation : 7 entrées, ajout de « Secteurs » cohérent avec le nouveau
  contenu. Mobile avec burger fonctionnel.
- Le hero enchaîne accroche, sous-titre, deux CTA et trois preuves. Bon rythme.
- Le mockup de dashboard montre quatre KPI, une liste de commandes, les
  encaissements par livreur, la caisse à reverser et les écarts détectés. Il met
  donc la caisse en avant dès le premier écran, ce qui est le bon choix.
- Les mentions d'honnêteté sous les sections chiffrées sont bien placées et
  bien rédigées.

Défauts UX restants :

- Aucun parcours de contact qui fonctionne (voir section 2).
- Pas de page « Comment ça marche » dédiée pour un visiteur qui veut comprendre
  avant de s'engager ; le parcours en neuf étapes de l'accueil joue ce rôle
  partiellement.
- Le blog ne compte que quatre articles : un visiteur qui arrive par là trouve
  peu de matière.

## 4. Audit SEO

Technique déjà en place : sitemap généré, robots.txt, canonicals, titres et
descriptions par page, hiérarchie de titres correcte.

Deux problèmes :

1. **Canonicals sur un sous-chemin.** En production, `NEXT_PUBLIC_SITE_URL`
   pointe sur `github.io/Jotoliko`. Aucune stratégie SEO ne fonctionne sur un
   sous-chemin de domaine partagé.
2. **Blog trop mince.** Quatre articles ne se classent pas sur les requêtes
   visées.

La stratégie complète (grappes d'intention, ordre de publication, données
structurées) est dans `docs/STRATEGIE-CROISSANCE.md`.

## 5. Analyse produit

**Fort.** Domaine testé, règles métier dans le domaine et non dans l'interface,
isolation multi-entreprises, offline-first assumé.

**Le point dur.** Il n'y a pas d'authentification, pas de backend, pas
d'application mobile. Le schéma Prisma existe (22 modèles) mais rien ne
l'exécute : l'état vit dans le navigateur. Conséquence : impossible d'ouvrir un
deuxième client, impossible de faire un pilote avec des données réelles,
impossible de s'inscrire.

C'est la frontière entre une démonstration et un produit, et le préalable à
toute levée de fonds crédible.

## 6. Analyse concurrence

Recherche menée sur le marché réel :

- **Chargel** — transport de fret et corridors d'Afrique de l'Ouest, plus de
  8 000 transporteurs, présent au Sénégal et en Côte d'Ivoire. Se présente comme
  « le système d'exploitation de la logistique africaine ». **Cette expression
  est donc occupée** : ne pas la reprendre.
- **AntsRoute** — optimisation de tournées généraliste, présent au Maghreb et en
  Côte d'Ivoire. Ne couvre pas la caisse terrain.
- **ERP sectoriels (KiboERP et similaires)** — comptabilité SYSCOHADA, mobile
  money, TVA. Hors du terrain.
- **Fintechs de paiement (CinetPay, PayDunya, TouchPay)** — encaissement en
  ligne, pas de rapprochement de caisse par livreur. Ce sont des partenaires
  potentiels, pas des concurrents.

**Conclusion.** Le créneau est libre : personne ne couvre le rapprochement de
caisse du dernier kilomètre pour les PME africaines. Le positionnement
recommandé est dans `docs/STRATEGIE-CROISSANCE.md`.

## 7. Preuves sociales — le point à trancher

Le brief demande témoignages, logos, études de cas, avis et chiffres clés.
Aucun n'est honnête aujourd'hui. Le site actuel les remplace par des scénarios
d'usage explicitement étiquetés, ce qui est la bonne solution en attendant.

La sortie par le haut est le **programme pilote** décrit dans
`docs/STRATEGIE-CROISSANCE.md` : de vrais clients, de vrais chiffres, publiés
avec leur accord.

### Calculateur ROI

Le brief demande un calculateur. La version honnête est celle qui a été livrée :
elle calcule à partir des chiffres saisis par le visiteur (volumes, montants
encaissés, écarts constatés) et n'applique aucun taux de gain. Elle dit
explicitement que Jotoliko ne promet pas de réduire les écarts d'un pourcentage
donné, mais les rend visibles et rattachés à un livreur.

## 8. Plan d'amélioration priorisé

**Priorité 0 — avant toute action commerciale.**

1. Remplacer le `mailto:` par un envoi réel.
2. Remplacer les coordonnées fictives.
3. Publier l'application sous `/app/`.
4. (Fait) Retirer la promesse d'offre gratuite.

**Priorité 1 — avant toute levée.**

5. Authentification et backend.
6. Pages sectorielles (faites) et calculateur ROI (fait).
7. Domaine propre avec canonicals corrects.

**Priorité 2 — croissance.**

8. Application livreur en PWA.
9. Wave puis Orange Money.
10. Blog alimenté par les questions réelles des prospects.

## 9. Sections livrées dans ce lot

- `/secteurs` et sept pages sectorielles : problématiques, bénéfices, trois
  moments de la journée, fonctions utilisées, et une section qui dit
  explicitement ce qui n'est pas publié faute de clients.
- Section « Jotoliko pour votre métier » en accueil.
- Section « Pourquoi Jotoliko ? » avant/après.
- Calculateur ROI fondé sur les chiffres du visiteur (`lib/roi.ts`, testé).
- Page `/communication` décrivant le module V2, avec sa disponibilité réelle.
