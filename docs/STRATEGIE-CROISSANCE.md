# Jotoliko — Stratégie de croissance et de contenu

Ce document répond aux points 9 (SEO) et 10 (croissance) du brief d'audit. Il
respecte la règle d'honnêteté d'`AGENTS.md` : aucun chiffre de résultat, aucune
preuve sociale inventée, aucun engagement non tenable.

## 1. Le problème à résoudre avant toute croissance

Le site marketing est prêt. Le tunnel de conversion ne l'est pas.

| Constat | Conséquence | Correction |
| --- | --- | --- |
| Le formulaire construit un `mailto:` | Le prospect doit avoir un client mail configuré ; sur mobile, abandon quasi systématique | Brancher un envoi réel (service de formulaire ou fonction serverless) |
| `contact@jotoliko.com`, `+221 77 000 00 00`, WhatsApp `+221770000000` | Aucun canal de contact ne fonctionne | Remplacer par de vraies coordonnées avant toute campagne |
| `/app/` renvoie 404 en production | La démonstration applicative est inaccessible | Publier l'application exportée sous `/app/` |
| Canonicals sur `github.io/Jotoliko` | Le référencement se construit sur un sous-chemin, pas sur le domaine | Servir `jotoliko.com` et y pointer `NEXT_PUBLIC_SITE_URL` |

Tant que ces quatre points ne sont pas traités, aucune campagne payante ne doit
être lancée : on paierait pour envoyer du trafic dans une impasse.

## 2. SEO

### 2.1 Grappes d'intention

Quatre grappes, classées par proximité avec l'achat. Les pages sectorielles
livrées couvrent déjà la grappe métier.

**Grappe commerciale** — le visiteur cherche un outil.

- logiciel de livraison au Sénégal
- logiciel pour livreurs à Dakar
- gestion des tournées de livraison
- suivi GPS des livreurs
- encaissement à la livraison
- logiciel logistique Afrique de l'Ouest
- application livreur Android hors ligne
- remplacer Excel pour gérer ses livraisons

**Grappe problème** — le visiteur cherche une solution à une douleur. C'est la
grappe qui convertit le mieux, parce qu'elle capte le dirigeant au moment où il
constate le problème.

- comment arrêter les écarts de caisse des livreurs
- comment suivre l'argent encaissé par ses agents
- livrer à domicile avec un adressage approximatif
- digitaliser une PME sénégalaise sans la traumatiser
- pourquoi les livraisons échouent et comment les réduire
- réconcilier les paiements à la livraison en espèces

**Grappe locale** — pour l'expansion, une page par ville.

- livraison à Dakar, à Thiès, à Abidjan, à Bamako
- paiement à la livraison en Côte d'Ivoire
- mobile money et livraison au Sénégal

**Grappe métier** — couverte par `/secteurs/*` : société de livraison,
restaurant, pharmacie, e-commerce, grossiste, distributeur, maintenance.

### 2.2 Pourquoi pas cinquante articles tout de suite

Le brief demande cinquante idées d'articles. En publier cinquante le premier
mois produirait cinquante pages minces, ce que Google traite comme du contenu de
faible valeur. La méthode qui fonctionne :

1. Publier les huit articles de la grappe problème, en profondeur (1 500 mots
   et plus, avec des exemples de terrain réels).
2. Ajouter une page locale par ville au fur et à mesure de l'expansion réelle.
3. Alimenter le blog avec les questions posées en rendez-vous. Chaque question
   client est un article, écrit avec la réponse exacte donnée ce jour-là.

Le blog actuel compte quatre articles. C'est le bon format, mais c'est trop peu
pour se classer. La cible utile est de vingt à trente articles solides sur douze
mois, pas cinquante articles courts.

### 2.3 Technique

- Domaine propre servi en HTTPS, `NEXT_PUBLIC_SITE_URL` pointé dessus.
- Données structurées `Organization` et `SoftwareApplication` sur l'accueil,
  `Article` sur le blog, `FAQPage` sur `/faq`.
- Le sitemap est déjà généré (30 URL). Il suivra les nouvelles pages.
- Maillage interne : chaque page sectorielle renvoie vers les fonctionnalités
  utilisées, chaque article renvoie vers la page sectorielle correspondante.

## 3. Croissance

### 3.1 Sénégal — phase pilote

Objectif : trois à cinq entreprises pilotes, pas un volume d'inscriptions.

- **Terrain direct.** Les sociétés de livraison de Dakar se connaissent entre
  elles. Trois rendez-vous obtenus par recommandation valent mieux qu'une
  campagne.
- **WhatsApp.** Le canal de vente réel. Un numéro professionnel, une réponse
  rapide, des captures d'écran de l'application plutôt que des plaquettes.
- **LinkedIn.** Pour les dirigeants et les gérants d'exploitation. Publier des
  observations de terrain, pas des publicités.
- **Facebook.** Utile pour les boutiques Instagram et les petits e-commerçants.

Le message central reste la caisse : « Savez-vous combien vos livreurs ont
encaissé aujourd'hui, et combien ils doivent vous reverser ? » C'est la question
qui ouvre la conversation.

### 3.2 Côte d'Ivoire et Mali — après preuve

Ne pas ouvrir un marché avant d'avoir un pilote concluant au Sénégal. Une fois
les premiers résultats mesurés chez un client réel :

- Partenariats avec les associations professionnelles de transport et de
  distribution locales.
- Un référent terrain par pays, plutôt qu'une équipe commerciale.
- Adaptation des intégrations mobile money au marché local (Wave et Orange
  Money couvrent les deux pays, ce qui limite le travail).

### 3.3 Ce qu'il faut mesurer

- Rendez-vous obtenus par canal.
- Taux de passage du rendez-vous au pilote.
- Coût d'acquisition par pilote signé.

Sans ces trois chiffres, aucune décision d'investissement marketing n'est
justifiable devant un investisseur.

## 4. Roadmap produit optimisée

La roadmap du site annonce V2, V3, V4. Voici l'ordre que je recommande, fondé
sur ce qui débloque la vente.

**Étape 0 — rendre le produit vendable.** Authentification et backend. Sans
eux, il n'y a ni deuxième client, ni pilote avec des données réelles, ni
démonstration en ligne. C'est le préalable à tout le reste.

**Étape 1 — tenir la promesse du site.** Publier l'application sous `/app/`,
brancher le formulaire, remplacer les coordonnées. Une semaine de travail.

**Étape 2 — le pilote.** Une société de livraison à Dakar, un flux complet :
commande, affectation, preuve, encaissement, remise de caisse, clôture. Objectif :
des chiffres réels à publier, avec l'accord du client.

**Étape 3 — l'application livreur.** PWA d'abord, pour livrer vite et tester le
terrain. Native seulement si l'usage l'exige (photo, GPS en arrière-plan,
batterie).

**Étape 4 — encaissements mobiles.** Wave et Orange Money, dans cet ordre, parce
que ce sont les deux canaux dominants au Sénégal. La caisse existante est déjà
prête à les accueillir comme modes de paiement.

**Étape 5 — communication client.** WhatsApp et SMS automatiques, comme décrit
dans `/communication`.

**Reporté sans regret.** L'optimisation de tournées par IA, la prévision des
délais et l'assistant IA n'ont de sens qu'avec un historique de données réelles.
Les construire avant serait construire sur du vide.

## 5. Positionnement

Ne pas se présenter comme « un logiciel de livraison », qui est un marché
encombré. Ne pas non plus reprendre « l'OS logistique africain » : cette
expression est déjà utilisée par Chargel, acteur financé et présent au Sénégal.

Position recommandée, étroite et défendable :

> **Jotoliko — la plateforme qui fait rentrer l'argent de vos livraisons.**
> Chaque livraison, chaque franc, tracé jusqu'à la remise.

Ce positionnement a trois qualités : il est vrai (c'est ce que le produit fait
mieux que les autres), il est mesurable (l'écart de caisse est un chiffre), et
il est défendable (les concurrents du fret ne le couvrent pas).

## 6. Programme pilote

Le brief demande des témoignages, des logos, des études de cas et des chiffres
clés. Aucun n'est honnête aujourd'hui, faute de clients publiés. La voie qui
résout le problème :

1. Recruter trois à cinq entreprises pilotes à Dakar.
2. Accès gratuit ou préférentiel en échange d'un droit de citer les résultats.
3. Mesurer avant et après sur trois indicateurs simples : écarts de caisse
   constatés, livraisons échouées, temps passé au téléphone par jour.
4. Publier une étude de cas par pilote, avec les chiffres réels et l'accord
   écrit de l'entreprise.

C'est ce qui transformera le site en machine de conversion, et ce qui donnera à
une levée de fonds sa matière : des clients en production, pas des promesses.
