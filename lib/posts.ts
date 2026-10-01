export type Post = {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  readingTime: string;
  category: string;
  body: string[];
};

export const posts: Post[] = [
  {
    slug: "livraison-a-domicile-senegal",
    title: "Livrer à domicile au Sénégal : les 5 réalités à intégrer",
    excerpt:
      "Adressage flou, paiement à la livraison, WhatsApp partout. Ce que tout logiciel logistique doit comprendre du terrain sénégalais.",
    date: "2026-01-14",
    readingTime: "6 min",
    category: "Terrain",
    body: [
      "Un logiciel de livraison importé de Paris ou de San Francisco suppose trois choses que le terrain sénégalais ne fournit pas : une adresse fiable, un paiement en ligne, et un client joignable par email. Tant que ces hypothèses ne sont pas remises en cause, l'outil reste sur l'étagère et l'équipe retourne sur WhatsApp.",
      "La première réalité, c'est l'adressage. À Dakar, une adresse utile ressemble rarement à « 12 rue Carnot ». Elle ressemble à « après la station Total de Sacré-Cœur, immeuble bleu à côté de la pharmacie ». Un bon outil doit donc accepter trois formes de localisation en même temps : un point GPS déposé sur une carte, un repère textuel libre, et un bouton d'appel direct. Si vous forcez le livreur à choisir entre la carte et le repère, il choisira WhatsApp.",
      "La deuxième réalité, c'est le paiement à la livraison. La majorité des commandes se règlent en espèces au moment de la remise. Cela déplace le centre de gravité du produit : votre logiciel n'est plus un outil de prise de commande, c'est un outil de gestion de caisse. La question que se pose le patron chaque soir n'est pas « combien de commandes ? » mais « combien d'argent est réellement rentré, et qui le détient encore ? »",
      "La troisième réalité, c'est la connexion. Un livreur en sous-sol, dans un marché couvert ou en zone périphérique perd le réseau plusieurs fois par jour. Une application qui exige une connexion permanente pour déclarer une livraison transforme chaque zone blanche en perte sèche. La synchronisation différée n'est pas une amélioration future, c'est une condition d'existence.",
      "La quatrième réalité, c'est le téléphone. Android d'entrée de gamme, stockage limité, batterie qui compte. Une application lourde, gourmande en data et en énergie, se fera désinstaller au bout d'une semaine. Chaque écran doit justifier sa place.",
      "La cinquième réalité, c'est l'adoption. Vos livreurs n'ont pas choisi cet outil et ne liront aucune documentation. S'ils ne comprennent pas une mission en dix secondes, ils appelleront le bureau. La simplicité n'est pas un argument marketing, c'est le facteur qui détermine si le système vit ou meurt.",
      "Ces cinq contraintes ne sont pas des obstacles à contourner. Ce sont le cahier des charges. Une plateforme qui les prend au sérieux n'a pas besoin d'être plus riche que ses concurrentes : elle a besoin d'être la seule qui fonctionne vraiment le lundi matin à 8h.",
    ],
  },
  {
    slug: "cash-a-la-livraison",
    title: "Cash à la livraison : comment arrêter de perdre de l'argent",
    excerpt:
      "La réconciliation de caisse est le point noir des opérations de livraison. Voici la méthode et les outils pour y mettre fin.",
    date: "2026-01-28",
    readingTime: "8 min",
    category: "Finance",
    body: [
      "Dans une opération de livraison avec paiement à la remise, l'argent circule dans les poches de vos livreurs avant d'arriver dans votre caisse. Entre le moment où le client paie et le moment où vous encaissez réellement, il y a un trou. C'est dans ce trou que disparaissent les marges.",
      "Le problème n'est presque jamais du vol caractérisé. C'est de l'usure : un livreur qui avance une course, un client qui paie partiellement, un reçu oublié, une erreur de rendu de monnaie. Additionnés sur trente livreurs et trente jours, ces petits écarts représentent une somme qui compte. Et comme rien n'est tracé, personne ne peut dire d'où elle vient.",
      "La première étape pour reprendre le contrôle, c'est de rendre chaque encaissement nominatif. Non pas « 4,2 millions encaissés aujourd'hui », mais « Moussa a encaissé 412 000 FCFA sur 38 livraisons ». Un chiffre agrégé ne se vérifie pas ; un chiffre attribué à une personne, oui.",
      "La deuxième étape, c'est de formaliser la remise de caisse. À la fin de la tournée, le livreur ne « rend ce qu'il a ». Il déclare un montant, l'entreprise le confronte à ce que le système attend, et l'écart est enregistré. Un écart de 500 FCFA noté et expliqué vaut mieux qu'un écart de 50 000 FCFA découvert trois semaines plus tard.",
      "La troisième étape, c'est de rendre la preuve systématique. Une livraison confirmée par une photo et un horodatage devient incontestable. Quand un client affirme n'avoir jamais reçu sa commande, la preuve règle la discussion en dix secondes — dans un sens ou dans l'autre.",
      "La quatrième étape, c'est de rapprocher le mode de paiement. Espèces, Wave, Orange Money, Free Money : chaque canal a son propre délai et ses propres frais. Tant que tout est mélangé dans un cahier, vous ne savez pas quel canal vous coûte le plus cher.",
      "Rien de tout cela ne demande une technologie sophistiquée. Cela demande de la discipline, matérialisée dans un outil que vos équipes utilisent réellement. C'est précisément le rôle que Jotoliko joue : transformer une politique de caisse en gestes quotidiens de trois taps.",
    ],
  },
  {
    slug: "offline-first-afrique",
    title: "Pourquoi votre logiciel logistique doit fonctionner hors ligne",
    excerpt:
      "Un livreur sans réseau reste un livreur. Comment concevoir une application terrain qui ne s'arrête jamais.",
    date: "2026-02-11",
    readingTime: "7 min",
    category: "Produit",
    body: [
      "La plupart des applications mobiles professionnelles sont conçues « online-first » : elles supposent une connexion et gèrent l'absence de réseau comme une erreur. Sur le terrain africain, cette hypothèse est fausse plusieurs fois par jour.",
      "Concevoir hors ligne d'abord, cela ne veut pas dire se priver de synchronisation. Cela veut dire inverser la source de vérité locale : le téléphone du livreur détient l'état de ses missions, et le serveur le reçoit plus tard. Le livreur n'attend jamais le réseau pour travailler.",
      "Le premier pilier technique, c'est l'identifiant généré côté client. Si l'application attend du serveur qu'il attribue un numéro à chaque livraison, elle est bloquée dès la première zone blanche. Un identifiant créé sur le téléphone, unique par construction, permet de tout enregistrer localement sans dépendre de personne.",
      "Le deuxième pilier, c'est l'idempotence. Un livreur qui déclare une livraison, perd le réseau, puis resynchronise, ne doit pas créer deux livraisons. Chaque opération doit pouvoir être rejouée sans effet de bord, ce qui impose de raisonner en intentions plutôt qu'en écritures brutes.",
      "Le troisième pilier, c'est la résolution de conflits. Que se passe-t-il si le bureau annule une commande pendant que le livreur la déclare livrée ? Il faut une règle explicite, connue de tous, et non un comportement émergent découvert en production. Dans notre cas, une livraison effectuée sur le terrain prime, mais l'anomalie est signalée pour arbitrage humain.",
      "Le quatrième pilier, c'est la visibilité. Un utilisateur qui ne sait pas si ses données sont synchronisées perd confiance. Un indicateur clair — « 3 missions en attente d'envoi » — vaut mieux qu'une icône ambiguë.",
      "Ces choix coûtent du travail au moment de la conception et presque rien ensuite. Les ajouter après coup, sur une base qui suppose le réseau permanent, coûte plusieurs mois de refonte. C'est la décision d'architecture la plus lourde de conséquences d'un produit terrain, et elle se prend au premier jour.",
    ],
  },
  {
    slug: "digitaliser-pme-excel",
    title: "Passer d'Excel à un vrai outil sans traumatiser votre équipe",
    excerpt:
      "Vos équipes vivent sur Excel depuis des années. Comment réussir la transition sans les perdre.",
    date: "2026-02-25",
    readingTime: "5 min",
    category: "Adoption",
    body: [
      "Excel n'est pas l'ennemi. C'est un outil que vos équipes maîtrisent, qui ne tombe jamais en panne de réseau, et qui a coûté zéro franc. Si vous le remplacez par un logiciel perçu comme plus compliqué, vous perdez la bataille avant de la commencer.",
      "La transition réussit quand le nouvel outil fait gagner du temps sur les gestes les plus fréquents, et quand il fait ce qu'Excel ne sait pas faire. Un tableur ne sait pas dire où est un livreur. Il ne sait pas produire une preuve de livraison horodatée. Il ne sait pas alerter quand la caisse d'un livreur ne correspond pas. C'est là qu'il faut frapper.",
      "Commencez par un périmètre étroit. Un seul processus, une seule équipe, une seule semaine. Si vous déployez dix modules le premier jour, la première erreur fera rejeter l'ensemble. Si vous déployez l'affectation des livraisons et que l'équipe y voit un gain immédiat, elle réclamera elle-même le module suivant.",
      "Prévoyez l'import. Vos clients, vos produits, votre historique : ils existent déjà dans un fichier. Demander à une équipe de tout ressaisir est la façon la plus rapide de tuer un projet. L'import Excel n'est pas une fonctionnalité secondaire, c'est la porte d'entrée.",
      "Gardez un canal de sortie. Les équipes craignent de perdre la main sur leurs données. Une exportation PDF ou Excel disponible à tout moment les rassure, même si elles ne s'en servent jamais. La liberté de partir est ce qui rend acceptable de rester.",
      "Enfin, mesurez ce que vous avez promis. Si vous avez annoncé « moins de temps passé à coordonner », montrez le chiffre après un mois. Une adoption se construit sur des preuves, pas sur des convictions.",
    ],
  },
];

export function getPost(slug: string): Post | undefined {
  return posts.find((p) => p.slug === slug);
}
