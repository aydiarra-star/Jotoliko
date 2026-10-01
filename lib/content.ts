export const site = {
  name: "Jotoliko",
  slogan: "Gérez. Livrez. Encaissez.",
  description:
    "Jotoliko aide les entreprises africaines à gérer leurs commandes, livraisons, tournées et encaissements depuis une seule plateforme simple, rapide et efficace.",
  url: "https://jotoliko.com",
  country: "Sénégal",
  contactEmail: "contact@jotoliko.com",
  contactPhone: "+221 77 000 00 00",
  whatsapp: "+221770000000",
} as const;

export const nav: { href: string; label: string }[] = [
  { href: "/fonctionnalites", label: "Fonctionnalités" },
  { href: "/solutions", label: "Solutions" },
  { href: "/tarifs", label: "Tarifs" },
  { href: "/blog", label: "Blog" },
  { href: "/a-propos", label: "À propos" },
  { href: "/faq", label: "FAQ" },
];

export const footerNav: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Produit",
    links: [
      { href: "/fonctionnalites", label: "Fonctionnalités" },
      { href: "/solutions", label: "Solutions" },
      { href: "/tarifs", label: "Tarifs" },
      { href: "/demo", label: "Demander une démo" },
    ],
  },
  {
    title: "Entreprise",
    links: [
      { href: "/a-propos", label: "À propos" },
      { href: "/blog", label: "Blog" },
      { href: "/contact", label: "Contact" },
      { href: "/faq", label: "FAQ" },
    ],
  },
];

export const markets = [
  "Sénégal",
  "Côte d'Ivoire",
  "Mali",
  "Bénin",
  "Togo",
  "Guinée",
  "Cameroun",
];

// Ces éléments décrivent la conception du produit, pas des performances mesurées.
// Aucun chiffre d'amélioration n'est affiché tant qu'il n'a pas été relevé chez
// un client réel.
export const engagements = [
  { value: "100 %", label: "des encaissements rattachés à une livraison et à un livreur" },
  { value: "0", label: "double saisie : la caisse se calcule depuis les livraisons" },
  { value: "Hors ligne", label: "le livreur continue de travailler sans réseau" },
  { value: "1 journée", label: "objectif de prise en main pour une équipe terrain" },
];

// Enchaînement des étapes, de la commande au rapport.
// Sert de section « Une journée avec Jotoliko » sur la page d'accueil.
export const parcours = [
  { etape: "Commande reçue", detail: "Saisie au bureau ou transmise par WhatsApp." },
  { etape: "Commande affectée", detail: "Attribuée à un livreur disponible." },
  { etape: "Livreur en route", detail: "Le livreur ouvre sa mission et démarre." },
  { etape: "Suivi", detail: "Position et avancement visibles au bureau." },
  { etape: "Arrivée chez le client", detail: "Le livreur déclare son arrivée." },
  { etape: "Preuve de livraison", detail: "Photo, réceptionnaire, horodatage." },
  { etape: "Encaissement", detail: "Montant reçu et mode de paiement enregistrés." },
  { etape: "Caisse", detail: "Montant à remettre et écart calculés par livreur." },
  { etape: "Rapport", detail: "Journée consolidée, exportable." },
];

export const problems = [
  {
    title: "Commandes éparpillées",
    body: "Une commande sur WhatsApp, une sur un cahier, une dans Excel. Personne ne sait laquelle est à jour.",
  },
  {
    title: "Livreurs injoignables",
    body: "Savoir qui est où et qui a livré quoi demande vingt appels par jour.",
  },
  {
    title: "Caisse introuvable",
    body: "À la fin de la journée, impossible de savoir ce qui a réellement été encaissé et remis.",
  },
  {
    title: "Aucun historique",
    body: "Impossible de savoir qui a livré quoi, quand, ni combien cela a rapporté.",
  },
];

export const features = [
  {
    slug: "commandes",
    icon: "ClipboardList",
    title: "Gestion des commandes",
    tagline: "Créez, modifiez et suivez chaque commande",
    body: "Créez une commande en quelques secondes, dupliquez les récurrentes, annulez avec un motif tracé. Chaque ligne est suivie de la création jusqu'à la livraison et au paiement.",
    points: [
      "Création rapide, duplication en un clic",
      "Lignes d'articles, quantités et prix",
      "Statuts clairs : à préparer, en route, livrée, annulée",
      "Historique complet par client",
    ],
  },
  {
    slug: "livreurs",
    icon: "Bike",
    title: "Gestion des livreurs",
    tagline: "Vos équipes terrain sous contrôle",
    body: "Créez vos livreurs, activez ou désactivez leur accès, et voyez en un coup d'œil qui est disponible, qui est en tournée, et qui a terminé.",
    points: [
      "Fiches livreurs et véhicules",
      "Disponibilité permanente",
      "Performance individuelle",
      "Désactivation immédiate d'un accès",
    ],
  },
  {
    slug: "affectation",
    icon: "Route",
    title: "Affectation & tournées",
    tagline: "La bonne commande, au bon livreur",
    body: "Attribuez une commande à un livreur, regroupez plusieurs livraisons proches dans une tournée, et suivez l'avancement mission par mission.",
    points: [
      "Attribution manuelle ou par zone",
      "Tournées multi-livraisons",
      "Réaffectation en un geste",
      "Priorités et créneaux",
    ],
  },
  {
    slug: "application-livreur",
    icon: "Smartphone",
    title: "Application livreur",
    tagline: "Conçue pour le terrain, pas pour le bureau",
    body: "Vos livreurs voient leurs missions, appellent le client en un tap, ouvrent le GPS, et déclarent la livraison — même quand le réseau vacille.",
    points: [
      "Liste des missions du jour",
      "Appel client en un tap",
      "Ouverture GPS intégrée",
      "Déclaration de livraison hors ligne",
    ],
  },
  {
    slug: "suivi-gps",
    icon: "MapPin",
    title: "Suivi GPS",
    tagline: "Vos livreurs sur une carte, en direct",
    body: "Suivez la position de vos livreurs sur une carte lorsque leur téléphone transmet réellement des positions, vérifiez qu'une tournée avance, et rassurez vos clients sur l'arrivée. Quand le réseau est coupé, Jotoliko affiche la dernière position connue et son ancienneté — jamais une position inventée.",
    points: [
      "Carte de suivi d'une livraison",
      "Trajet réellement enregistré",
      "Zones et repères",
      "Dernière position connue en cas de coupure",
    ],
  },
  {
    slug: "preuve-de-livraison",
    icon: "Camera",
    title: "Preuve de livraison",
    tagline: "Photo, signature, horodatage",
    body: "Chaque livraison est confirmée par une preuve : photo, nom du réceptionnaire, position et heure. Fini les contestations.",
    points: [
      "Photo de livraison",
      "Nom et signature du réceptionnaire",
      "Horodatage et position",
      "Preuve consultable à tout moment",
    ],
  },
  {
    slug: "encaissements",
    icon: "Wallet",
    title: "Encaissements & caisse",
    tagline: "Le cash, tracé jusqu'à la remise",
    body: "Jotoliko enregistre ce que chaque livreur encaisse, calcule ce qu'il doit reverser, et met en évidence le moindre écart. C'est là que le produit devient irremplaçable.",
    points: [
      "Paiement à la livraison, espèces ou mobile money",
      "Caisse attendue par livreur",
      "Remise de caisse et écarts",
      "Rapprochement quotidien",
    ],
  },
  {
    slug: "rapports",
    icon: "BarChart3",
    title: "Rapports & pilotage",
    tagline: "Décidez avec des chiffres, pas des impressions",
    body: "Rapport journalier, rapport mensuel, performance des livreurs, chiffre d'affaires encaissé. Exportez en PDF et partagez en un clic.",
    points: [
      "Rapport journalier et mensuel",
      "Performance des livreurs",
      "Chiffre d'affaires et encaissements",
      "Export PDF et Excel",
    ],
  },
];

export const personas = [
  {
    icon: "Truck",
    title: "Sociétés de livraison",
    body: "Coordonnez vos livreurs, vos tournées et votre caisse depuis un seul écran.",
  },
  {
    icon: "UtensilsCrossed",
    title: "Restaurants",
    body: "Prenez les commandes, affectez les livraisons, suivez les encaissements du soir.",
  },
  {
    icon: "Pill",
    title: "Pharmacies",
    body: "Livrez vite et gardez une preuve horodatée de chaque remise.",
  },
  {
    icon: "ShoppingBag",
    title: "E-commerce & Instagram",
    body: "Transformez les DM en commandes suivies, du panier à l'encaissement.",
  },
  {
    icon: "Store",
    title: "Boutiques & grossistes",
    body: "Gérez les tournées de réassort et les encaissements de vos agents.",
  },
  {
    icon: "Wrench",
    title: "Maintenance & agents terrain",
    body: "Planifiez les interventions et suivez chaque passage avec preuve.",
  },
];

export const roadmap = [
  {
    phase: "MVP",
    label: "Disponible",
    items: [
      "Commandes, clients, livreurs",
      "Affectation et tournées",
      "Application livreur",
      "Preuve de livraison photo",
      "Encaissements et caisse",
      "Rapports journaliers",
    ],
  },
  {
    phase: "V2",
    label: "À venir",
    items: [
      "WhatsApp Business",
      "SMS automatiques",
      "Import Excel",
      "Export PDF",
      "API publique",
    ],
  },
  {
    phase: "V3",
    label: "En préparation",
    items: [
      "Wave",
      "Orange Money",
      "Free Money",
      "Portail client",
    ],
  },
  {
    phase: "V4",
    label: "Vision",
    items: [
      "Optimisation de tournées par IA",
      "Prévision des délais",
      "Détection d'anomalies",
      "Assistant IA Jotoliko",
    ],
  },
];

export const faqs = [
  {
    q: "Jotoliko est-il un service de livraison ?",
    a: "Non. Jotoliko est un logiciel. Nous ne livrons pas à votre place : nous outillons vos équipes pour qu'elles livrent mieux, plus vite, et qu'elles encaissent sans perte.",
  },
  {
    q: "Faut-il une connexion internet permanente ?",
    a: "Non. L'application livreur fonctionne hors ligne : les missions, les déclarations de livraison et les encaissements sont enregistrés sur le téléphone puis synchronisés dès que le réseau revient.",
  },
  {
    q: "Mes livreurs savent-ils utiliser un smartphone ?",
    a: "L'application livreur est volontairement réduite à l'essentiel : voir les missions, appeler le client, ouvrir le GPS, déclarer la livraison. La prise en main se fait en quelques minutes.",
  },
  {
    q: "Puis-je encaisser en espèces, Wave ou Orange Money ?",
    a: "Oui. Jotoliko enregistre le mode de paiement de chaque commande. L'intégration directe avec Wave, Orange Money et Free Money arrive en V3.",
  },
  {
    q: "Combien de temps pour démarrer ?",
    a: "La création du compte prend quelques minutes. Notre équipe vous accompagne ensuite pour importer vos clients et vos premières commandes.",
  },
  {
    q: "Mes données sont-elles en sécurité ?",
    a: "Vos données sont isolées par entreprise, chiffrées en transit, et sauvegardées quotidiennement. Vous restez propriétaire de vos données et pouvez les exporter à tout moment.",
  },
];

export const blogPosts = [
  {
    slug: "livraison-a-domicile-senegal",
    title: "Livrer à domicile au Sénégal : les 5 réalités à intégrer",
    excerpt:
      "Adressage flou, paiement à la livraison, WhatsApp partout. Ce que tout logiciel logistique doit comprendre du terrain sénégalais.",
    date: "2026-01-14",
    readingTime: "6 min",
    category: "Terrain",
  },
  {
    slug: "cash-a-la-livraison",
    title: "Cash à la livraison : comment arrêter de perdre de l'argent",
    excerpt:
      "La réconciliation de caisse est le point noir des opérations de livraison. Voici la méthode et les outils pour y mettre fin.",
    date: "2026-01-28",
    readingTime: "8 min",
    category: "Finance",
  },
  {
    slug: "offline-first-afrique",
    title: "Pourquoi votre logiciel logistique doit fonctionner hors ligne",
    excerpt:
      "Un livreur sans réseau reste un livreur. Comment concevoir une application terrain qui ne s'arrête jamais.",
    date: "2026-02-11",
    readingTime: "7 min",
    category: "Produit",
  },
  {
    slug: "digitaliser-pme-excel",
    title: "Passer d'Excel à un vrai outil sans traumatiser votre équipe",
    excerpt:
      "Vos équipes vivent sur Excel depuis des années. Comment réussir la transition sans les perdre.",
    date: "2026-02-25",
    readingTime: "5 min",
    category: "Adoption",
  },
];

// Scénarios d'usage, pas des témoignages de clients réels.
// Jotoliko n'a pas encore de clients publiés : présenter de faux témoignages
// serait malhonnête envers les prospects.
export const scenarios = [
  {
    quote:
      "La caisse se clôture sans discussion : on sait exactement ce que chaque livreur a collecté, commande par commande.",
    author: "Responsable d'exploitation",
    role: "Société de livraison, Dakar",
  },
  {
    quote:
      "Les commandes reçues sur les réseaux sociaux sont suivies comme les autres : on sait laquelle est partie et laquelle est payée.",
    author: "Fondatrice",
    role: "Boutique en ligne, Abidjan",
  },
  {
    quote:
      "L'application livreur se limite à l'essentiel : voir les missions, appeler, déclarer la livraison.",
    author: "Gérant",
    role: "Grossiste, Dakar",
  },
];

export const pricing = [
  {
    name: "Starter",
    price: "15 000",
    unit: "FCFA / mois",
    tagline: "Pour se lancer et digitaliser ses premières livraisons.",
    features: [
      "Jusqu'à 3 utilisateurs",
      "Jusqu'à 5 livreurs",
      "Commandes illimitées",
      "Application livreur",
      "Preuve de livraison photo",
      "Rapport journalier",
    ],
    cta: "Commencer gratuitement",
    highlight: false,
  },
  {
    name: "Business",
    price: "39 000",
    unit: "FCFA / mois",
    tagline: "Pour les entreprises qui livrent tous les jours.",
    features: [
      "Jusqu'à 15 utilisateurs",
      "Jusqu'à 30 livreurs",
      "Suivi GPS des livraisons",
      "Encaissements & caisse",
      "Tournées multi-livraisons",
      "Rapports mensuels et export PDF",
      "Support prioritaire",
    ],
    cta: "Demander une démo",
    highlight: true,
  },
  {
    name: "Entreprise",
    price: "Sur devis",
    unit: "tarification dédiée",
    tagline: "Pour les opérations multi-sites et les gros volumes.",
    features: [
      "Utilisateurs illimités",
      "Livreurs illimités",
      "API publique",
      "Intégrations sur mesure",
      "SLA et accompagnement dédié",
      "Formation des équipes",
    ],
    cta: "Nous contacter",
    highlight: false,
  },
];
