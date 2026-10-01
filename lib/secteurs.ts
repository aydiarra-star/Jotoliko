// Contenu des pages sectorielles.
//
// Règle d'honnêteté (voir AGENTS.md) : ces pages décrivent des cas d'usage et
// des problèmes observés sur le terrain. Elles ne contiennent ni témoignage,
// ni logo, ni chiffre de résultat, parce que Jotoliko n'a pas encore de clients
// publiés. Chaque section est étiquetée comme telle dans l'interface.

export type Secteur = {
  slug: string;
  nom: string;
  /** Nom court utilisé dans les listes et la navigation. */
  nomCourt: string;
  icon: string;
  /** Phrase d'accroche du hero. */
  accroche: string;
  /** Résumé de la situation actuelle du métier. */
  situation: string;
  problematiques: { titre: string; detail: string }[];
  benefices: { titre: string; detail: string }[];
  casUsage: { titre: string; detail: string }[];
  /** Fonctionnalités Jotoliko les plus pertinentes, par slug. */
  fonctionnalites: string[];
};

export const secteurs: Secteur[] = [
  {
    slug: "societes-de-livraison",
    nom: "Jotoliko pour les sociétés de livraison",
    nomCourt: "Sociétés de livraison",
    icon: "Truck",
    accroche: "Vos livreurs, vos tournées et votre caisse sur un seul écran.",
    situation:
      "Vous coordonnez une flotte de livreurs sur Dakar et sa périphérie. Les commandes arrivent par téléphone et WhatsApp, l'affectation se fait de mémoire, et le soir vous reconstituez la caisse à partir de cahiers et de messages vocaux.",
    problematiques: [
      {
        titre: "L'affectation se décide au téléphone",
        detail:
          "Qui est libre, qui est proche, qui a déjà quatre courses ? Sans vue d'ensemble, la même course est proposée à deux livreurs ou à aucun.",
      },
      {
        titre: "Le suivi client sature la ligne",
        detail:
          "« Où est ma commande ? » revient dix fois par jour. Chaque appel mobilise quelqu'un au bureau au lieu de faire avancer les livraisons.",
      },
      {
        titre: "La caisse du soir ne tombe jamais juste",
        detail:
          "Les espèces encaissées ne correspondent pas toujours à ce qui est reversé. L'écart est constaté, rarement expliqué, jamais tracé.",
      },
      {
        titre: "Les zones blanches font perdre des livraisons",
        detail:
          "Un livreur en sous-sol ou au marché perd le réseau. S'il ne peut pas déclarer sa livraison sur place, l'information se perd ou arrive le lendemain.",
      },
    ],
    benefices: [
      {
        titre: "Une file d'affectation lisible",
        detail:
          "Les commandes à affecter sont regroupées, les livreurs disponibles visibles, l'attribution enregistrée avec son horodatage.",
      },
      {
        titre: "Une preuve à chaque remise",
        detail:
          "Photo, nom du réceptionnaire et position enregistrés au moment de la remise. La contestation « je n'ai rien reçu » se règle avec une pièce, pas avec une discussion.",
      },
      {
        titre: "Une caisse qui se calcule toute seule",
        detail:
          "Pour chaque livreur : attendu, encaissé, à remettre, remis, reste, écart. L'écart est mis en évidence et peut être expliqué par un commentaire daté.",
      },
      {
        titre: "Une journée qui se clôture sans tableur",
        detail:
          "Le rapport de clôture rassemble ce qui a été fait, encaissé et remis, et signale ce qui ne colle pas.",
      },
    ],
    casUsage: [
      {
        titre: "Le matin, répartir les courses",
        detail:
          "Le bureau affecte les commandes de la journée. Chaque livreur retrouve ses missions dans l'application, sans appel et sans message.",
      },
      {
        titre: "En tournée, déclarer en trois gestes",
        detail:
          "Le livreur ouvre la mission, appelle le client, ouvre le GPS, puis déclare la livraison avec sa preuve — même sans réseau.",
      },
      {
        titre: "Le soir, clôturer la caisse",
        detail:
          "Chaque livreur remet ce qu'il a encaissé. Jotoliko calcule l'écart et le met en évidence avant qu'il ne devienne un litige.",
      },
    ],
    fonctionnalites: ["affectation", "application-livreur", "preuve-de-livraison", "encaissements", "rapports"],
  },
  {
    slug: "restaurants",
    nom: "Jotoliko pour les restaurants",
    nomCourt: "Restaurants",
    icon: "UtensilsCrossed",
    accroche: "Vos commandes du soir, vos livreurs et votre caisse sous contrôle.",
    situation:
      "Votre rush, c'est le soir. Les commandes arrivent par téléphone, WhatsApp et Instagram en même temps, pendant que la salle tourne. Le livreur part avec deux ou trois commandes et l'argent qui va avec.",
    problematiques: [
      {
        titre: "Le rush concentre les erreurs",
        detail:
          "Adresse mal notée, plat oublié, commande attribuée au mauvais client : c'est au moment où vous avez le moins de temps que les erreurs coûtent le plus cher.",
      },
      {
        titre: "Le livreur part avec du cash non tracé",
        detail:
          "Trois commandes, trois paiements à la livraison. Sans relevé par livreur, la caisse du soir se reconstitue de mémoire.",
      },
      {
        titre: "Les commandes arrivent par trois canaux",
        detail:
          "Téléphone, WhatsApp, Instagram : rien n'est centralisé, donc rien n'est priorisé. Une commande peut rester en attente pendant que l'équipe traite les deux autres.",
      },
      {
        titre: "Le client rappelle pendant le service",
        detail:
          "Le téléphone sonne pour un suivi alors que quelqu'un doit prendre la commande suivante.",
      },
    ],
    benefices: [
      {
        titre: "Un seul registre de commandes",
        detail:
          "Toutes les commandes du soir au même endroit, quel que soit le canal d'arrivée, avec leur statut visible d'un coup d'œil.",
      },
      {
        titre: "Une caisse par livreur, calculée",
        detail:
          "Ce que chaque livreur a encaissé et ce qu'il doit reverser, sans addition manuelle à la fin du service.",
      },
      {
        titre: "Des adresses utilisables",
        detail:
          "Repère textuel, point GPS et bouton d'appel : le livreur trouve le client même quand l'adresse est approximative.",
      },
      {
        titre: "Des preuves en cas de contestation",
        detail:
          "« Je n'ai pas reçu ma commande » se traite avec la photo et l'heure d'enregistrement.",
      },
    ],
    casUsage: [
      {
        titre: "Prendre une commande par WhatsApp",
        detail:
          "Le message du client est collé dans Jotoliko, qui en propose une commande. Le bureau relit, corrige le prix, puis crée.",
      },
      {
        titre: "Suivre les livraisons du service",
        detail:
          "Le gérant voit ce qui est parti, ce qui est livré et ce qui reste en cuisine, sans quitter son service.",
      },
      {
        titre: "Clôturer le service",
        detail:
          "En fin de soirée, la caisse de chaque livreur est calculée et l'écart signalé avant la fermeture.",
      },
    ],
    fonctionnalites: ["commandes", "application-livreur", "preuve-de-livraison", "encaissements"],
  },
  {
    slug: "pharmacies",
    nom: "Jotoliko pour les pharmacies",
    nomCourt: "Pharmacies",
    icon: "Pill",
    accroche: "Livrez vite, et gardez une trace horodatée de chaque remise.",
    situation:
      "Vos livraisons sont souvent urgentes et parfois sensibles. Le client veut sa commande vite, et vous devez pouvoir prouver qui l'a reçue, quand et où.",
    problematiques: [
      {
        titre: "L'urgence ne laisse pas de trace",
        detail:
          "Dans la précipitation, la remise se fait sans preuve. En cas de contestation, il ne reste ni nom, ni heure, ni photo.",
      },
      {
        titre: "Un produit remis à la mauvaise personne",
        detail:
          "Sans nom du réceptionnaire enregistré, la remise à un tiers non autorisé ne peut être ni confirmée ni contestée.",
      },
      {
        titre: "Les appels de suivi interrompent le comptoir",
        detail:
          "Chaque demande « où est ma commande ? » mobilise un préparateur qui devrait être au comptoir.",
      },
      {
        titre: "Les frais de livraison encaissés à part",
        detail:
          "Le prix des produits et les frais de course se règlent parfois séparément, ce qui complique la caisse du jour.",
      },
    ],
    benefices: [
      {
        titre: "Une preuve complète par remise",
        detail:
          "Photo, nom du réceptionnaire, commentaire et position : de quoi reconstituer une remise contestée plusieurs jours après.",
      },
      {
        titre: "Un état de la commande partagé",
        detail:
          "Le statut d'avancement est visible côté pharmacie, ce qui réduit les appels entrants pendant le service.",
      },
      {
        titre: "Une caisse qui distingue produits et frais",
        detail:
          "Le montant attendu par livraison est enregistré, ce qui évite de mélanger recettes et frais de course.",
      },
      {
        titre: "Un historique client",
        detail:
          "Les livraisons précédentes d'un client restent consultables, ce qui aide à traiter les commandes répétées.",
      },
    ],
    casUsage: [
      {
        titre: "Une livraison urgente",
        detail:
          "La commande est créée, affectée immédiatement à un livreur disponible, puis suivie jusqu'à la remise.",
      },
      {
        titre: "Une remise contestée",
        detail:
          "La preuve enregistrée à la remise permet de retrouver le nom du réceptionnaire et l'heure exacte.",
      },
      {
        titre: "Le relevé de fin de journée",
        detail:
          "Le rapport journalier donne les livraisons effectuées et les montants encaissés sur la journée.",
      },
    ],
    fonctionnalites: ["commandes", "preuve-de-livraison", "affectation", "rapports"],
  },
  {
    slug: "e-commerce",
    nom: "Jotoliko pour les e-commerçants",
    nomCourt: "E-commerce",
    icon: "ShoppingBag",
    accroche: "Transformez vos DM et vos commandes en livraisons suivies.",
    situation:
      "Vous vendez sur Instagram, WhatsApp et parfois un site. Les commandes arrivent en messages, se confirment en messages, et le suivi se fait encore en messages — jusqu'au jour où vous en perdez une.",
    problematiques: [
      {
        titre: "Les commandes vivent dans les conversations",
        detail:
          "Retrouver une commande passée il y a trois jours, c'est faire défiler une conversation. Rien n'est indexé, rien n'est priorisé.",
      },
      {
        titre: "Le paiement à la livraison fragilise la trésorerie",
        detail:
          "Quand le client paie à la réception, l'argent est dans la poche du livreur avant d'être dans la vôtre. Sans relevé, l'écart est invisible.",
      },
      {
        titre: "Les livraisons échouées coûtent deux fois",
        detail:
          "Client injoignable, adresse introuvable : la course est faite, le produit revient, et rien n'est documenté pour comprendre pourquoi.",
      },
      {
        titre: "Le client veut savoir où en est sa commande",
        detail:
          "Le suivi par message fonctionne à petite échelle et devient ingérable à partir de quelques dizaines de commandes par jour.",
      },
    ],
    benefices: [
      {
        titre: "Des commandes structurées",
        detail:
          "Chaque commande a une référence, un client, des lignes et un statut. Vous ne cherchez plus dans une conversation.",
      },
      {
        titre: "Le message WhatsApp transformé en commande",
        detail:
          "Collez le message reçu : Jotoliko en propose une commande, que vous relisez et corrigez avant création.",
      },
      {
        titre: "Des échecs documentés",
        detail:
          "Un motif d'échec est enregistré, ce qui permet de voir combien de courses échouent et pour quelle raison.",
      },
      {
        titre: "Une caisse rapprochée",
        detail:
          "Ce qui a été encaissé et ce qui a été reversé sont comparés par livreur, sans reconstitution manuelle.",
      },
    ],
    casUsage: [
      {
        titre: "Une commande reçue en DM",
        detail:
          "Le message est collé dans Jotoliko. Les articles reconnus sont proposés, les prix complétés, la commande créée.",
      },
      {
        titre: "Une tournée groupée",
        detail:
          "Plusieurs commandes du même secteur sont affectées à un livreur pour une seule tournée.",
      },
      {
        titre: "Une livraison échouée",
        detail:
          "Le livreur déclare l'échec avec son motif, et la commande revient au bureau pour être replanifiée.",
      },
    ],
    fonctionnalites: ["commandes", "affectation", "application-livreur", "encaissements"],
  },
  {
    slug: "grossistes",
    nom: "Jotoliko pour les grossistes",
    nomCourt: "Grossistes",
    icon: "Store",
    accroche: "Vos tournées de réassort et les encaissements de vos agents, sans angle mort.",
    situation:
      "Vos agents partent le matin avec un chargement et reviennent avec de l'argent. Entre les deux, vous n'avez aucune visibilité réelle : ni sur ce qui a été livré, ni sur ce qui a été encaissé.",
    problematiques: [
      {
        titre: "Le chargement part sans inventaire",
        detail:
          "Ce qui est parti en camion n'est pas systématiquement rapproché de ce qui a été vendu et de ce qui revient.",
      },
      {
        titre: "L'argent encaissé circule avec l'agent",
        detail:
          "Un agent peut encaisser plusieurs clients dans la journée. Sans relevé, la remise du soir repose sur sa déclaration.",
      },
      {
        titre: "Les clients revendeurs sont mal suivis",
        detail:
          "Historique d'achat, fréquence de réassort, encours : rien n'est consolidé, donc rien n'est anticipé.",
      },
      {
        titre: "Les impayés se découvrent trop tard",
        detail:
          "Une livraison partiellement réglée n'est constatée qu'au prochain passage, parfois des semaines plus tard.",
      },
    ],
    benefices: [
      {
        titre: "Une remise de caisse par agent",
        detail:
          "Pour chaque agent : ce qu'il devait encaisser, ce qu'il a encaissé, ce qu'il a remis, et l'écart.",
      },
      {
        titre: "Un historique par client revendeur",
        detail:
          "Les livraisons précédentes et les montants attendus restent consultables pour préparer le passage suivant.",
      },
      {
        titre: "Des tournées organisées",
        detail:
          "Les commandes d'une même zone sont regroupées et affectées, plutôt que distribuées au fil des appels.",
      },
      {
        titre: "Une preuve par remise",
        detail:
          "Le nom du réceptionnaire et l'heure sont enregistrés, ce qui limite les contestations sur les quantités.",
      },
    ],
    casUsage: [
      {
        titre: "Préparer la tournée du jour",
        detail:
          "Les commandes des revendeurs sont saisies et regroupées par zone, puis affectées aux agents.",
      },
      {
        titre: "Encaisser au fil des passages",
        detail:
          "Chaque règlement est enregistré sur la livraison concernée, avec son mode de paiement.",
      },
      {
        titre: "Rapprocher en fin de journée",
        detail:
          "La clôture compare, agent par agent, ce qui a été encaissé et ce qui a été reversé.",
      },
    ],
    fonctionnalites: ["commandes", "clients", "encaissements", "rapports"],
  },
  {
    slug: "distributeurs",
    nom: "Jotoliko pour les distributeurs",
    nomCourt: "Distributeurs",
    icon: "Route",
    accroche: "Plusieurs agents, plusieurs zones, un seul niveau de contrôle.",
    situation:
      "Vous couvrez plusieurs zones avec plusieurs agents. Chaque zone a ses clients, son rythme et son encaissement. Consolider tout cela demande aujourd'hui plusieurs tableurs et beaucoup de confiance.",
    problematiques: [
      {
        titre: "Chaque zone tient ses propres comptes",
        detail:
          "Sans référentiel commun, comparer la performance des zones revient à comparer des méthodes de calcul différentes.",
      },
      {
        titre: "La performance des agents est déclarative",
        detail:
          "Nombre de passages, livraisons réussies, montants encaissés : ces chiffres remontent souvent de mémoire.",
      },
      {
        titre: "Les écarts de caisse se diluent",
        detail:
          "Répartis sur plusieurs agents et plusieurs zones, les petits écarts deviennent invisibles à l'échelle de l'entreprise.",
      },
      {
        titre: "Le pilotage arrive après coup",
        detail:
          "Le rapport du mois est établi quand le mois est terminé, donc trop tard pour corriger la tournée en cours.",
      },
    ],
    benefices: [
      {
        titre: "Un référentiel unique",
        detail:
          "Clients, livreurs, commandes et montants sont enregistrés de la même façon, quelle que soit la zone.",
      },
      {
        titre: "Une performance mesurée, pas déclarée",
        detail:
          "Les livraisons effectuées et les montants encaissés proviennent des enregistrements du terrain.",
      },
      {
        titre: "Un écart visible par agent",
        detail:
          "Chaque écart de caisse est isolé par agent et par journée, donc traitable au lieu de se diluer.",
      },
      {
        titre: "Un pilotage au jour le jour",
        detail:
          "Le rapport journalier et la clôture donnent l'état réel de la journée, pas celui du mois dernier.",
      },
    ],
    casUsage: [
      {
        titre: "Répartir les zones du jour",
        detail:
          "Les commandes sont affectées par zone et par agent, avec une trace de qui a reçu quoi et quand.",
      },
      {
        titre: "Suivre l'avancement en direct",
        detail:
          "L'état des livraisons de chaque agent est consultable pendant la journée, sans appel téléphonique.",
      },
      {
        titre: "Consolider la journée",
        detail:
          "La clôture agrège les agents et met en évidence les caisses qui ne sont pas justes.",
      },
    ],
    fonctionnalites: ["livreurs", "affectation", "encaissements", "rapports"],
  },
  {
    slug: "maintenance-terrain",
    nom: "Jotoliko pour la maintenance terrain",
    nomCourt: "Maintenance terrain",
    icon: "Wrench",
    accroche: "Chaque intervention planifiée, exécutée et prouvée.",
    situation:
      "Vos techniciens se déplacent chez des clients pour installer, réparer ou contrôler. Ce qui s'est réellement passé sur place n'est connu qu'au retour, par déclaration.",
    problematiques: [
      {
        titre: "L'intervention n'est pas prouvée",
        detail:
          "Sans photo ni horodatage, il est difficile d'établir qu'un passage a bien eu lieu et dans quel état les lieux ont été laissés.",
      },
      {
        titre: "Le planning se réorganise par téléphone",
        detail:
          "Un technicien bloqué décale la journée, et la réorganisation se fait appel par appel.",
      },
      {
        titre: "Le temps réel passé sur site est inconnu",
        detail:
          "La durée d'une intervention se reconstitue après coup, ce qui rend la charge de travail difficile à évaluer.",
      },
      {
        titre: "Les pièces et frais sont déclarés après coup",
        detail:
          "Ce qui a été utilisé ou facturé sur place remonte en fin de journée, parfois de mémoire.",
      },
    ],
    benefices: [
      {
        titre: "Une intervention prouvée",
        detail:
          "Photo, nom du réceptionnaire et heure d'enregistrement : le passage est documenté, pas seulement déclaré.",
      },
      {
        titre: "Un état des interventions partagé",
        detail:
          "Le bureau voit où en est chaque intervention sans appeler le technicien.",
      },
      {
        titre: "Des échecs motivés",
        detail:
          "Une intervention impossible est déclarée avec son motif — client absent, accès refusé — et non perdue.",
      },
      {
        titre: "Un relevé des montants encaissés",
        detail:
          "Si le technicien encaisse sur place, le montant est enregistré sur l'intervention et rapproché à la remise.",
      },
    ],
    casUsage: [
      {
        titre: "Planifier la journée",
        detail:
          "Les interventions sont affectées à un technicien, qui retrouve sa liste dans l'application.",
      },
      {
        titre: "Clôturer une intervention",
        detail:
          "Le technicien déclare l'intervention terminée avec sa preuve, même sans réseau sur place.",
      },
      {
        titre: "Signaler un passage impossible",
        detail:
          "L'échec est enregistré avec son motif, et l'intervention revient au planning pour être replanifiée.",
      },
    ],
    fonctionnalites: ["affectation", "application-livreur", "preuve-de-livraison", "rapports"],
  },
];

export function trouverSecteur(slug: string): Secteur | undefined {
  return secteurs.find((s) => s.slug === slug);
}
