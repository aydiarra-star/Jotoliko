// Jeu de données de démonstration.
//
// IMPORTANT — tout ce fichier est fictif. Aucune entreprise, aucun client et
// aucune position GPS ne provient du terrain. Chaque entité porte
// `provenance: "DEMO"`, ce qui permet à l'interface de le signaler et
// d'empêcher toute confusion avec une donnée opérationnelle.
//
// Les horodatages sont calculés à partir d'un instant de référence plutôt
// qu'écrits en dur : la démonstration reste cohérente quel que soit le moment
// où elle est ouverte, et le rendu statique ne produit aucun décalage.

import type {
  Adresse,
  Client,
  Commande,
  Entreprise,
  EvenementLivraison,
  Livreur,
  Livraison,
  ModePaiement,
  Monde,
  Paiement,
  PositionGps,
  Preuve,
  Remise,
  Utilisateur,
  Vehicule,
} from "./types";

export const MINUTE = 60_000;
export const HEURE = 60 * MINUTE;

// ---------------------------------------------------------------------------
// Coordonnées de Dakar utilisées par les scénarios
// ---------------------------------------------------------------------------

const COORDONNEES = {
  depot: { lat: 14.7165, lng: -17.4637, zone: "Sacré-Cœur 3" },
  liberte6: { lat: 14.7238, lng: -17.4756, zone: "Liberté 6" },
  plateau: { lat: 14.6691, lng: -17.4381, zone: "Plateau" },
  mermoz: { lat: 14.7012, lng: -17.4742, zone: "Mermoz" },
  almadies: { lat: 14.7452, lng: -17.5183, zone: "Almadies" },
  grandYoff: { lat: 14.7284, lng: -17.4619, zone: "Grand Yoff" },
  ouakam: { lat: 14.7121, lng: -17.4878, zone: "Ouakam" },
  pointE: { lat: 14.6885, lng: -17.4593, zone: "Point E" },
} as const;

/**
 * Trace réellement relevée entre le dépôt et Liberté 6.
 * Ce ne sont pas des points de routage : c'est la suite des positions émises
 * par le téléphone, ce que la carte dessine comme tracé plein.
 */
const TRACE_VERS_LIBERTE6 = [
  { lat: 14.7165, lng: -17.4637, ageMin: 34 },
  { lat: 14.7178, lng: -17.4652, ageMin: 27 },
  { lat: 14.7192, lng: -17.4668, ageMin: 21 },
  { lat: 14.7203, lng: -17.4685, ageMin: 15 },
  { lat: 14.7214, lng: -17.4701, ageMin: 9 },
  { lat: 14.7221, lng: -17.4718, ageMin: 4 },
  { lat: 14.7225, lng: -17.4732, ageMin: 0.13 },
];

function adresse(a: {
  ligne: string;
  zone: string;
  repere?: string;
  lat?: number;
  lng?: number;
}): Adresse {
  return { ...a, ville: "Dakar" };
}

// ---------------------------------------------------------------------------
// Construction du monde
// ---------------------------------------------------------------------------

export function construireMonde(maintenant: number): Monde {
  // Tous les horodatages sont calculés vers le passé depuis l'instant courant,
  // jamais ancrés à une heure fixe de la journée. Ancrer à midi produirait des
  // positions dans le futur si la page est ouverte le matin, et une position
  // future est justement rejetée comme incohérente : le suivi afficherait
  // « position indisponible » alors que la trace existe.
  //
  // On borne également au début de la journée : les scénarios restent ainsi
  // dans la journée en cours, même tôt le matin.
  const debutJournee = (() => {
    const d = new Date(maintenant);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  })();
  const ilYA = (minutes: number) =>
    Math.max(debutJournee, maintenant - minutes * MINUTE);

  const entreprise: Entreprise = {
    id: "ent-1",
    nom: "Dakar Express Livraison",
    ville: "Dakar",
    pays: "Sénégal",
    devise: "FCFA",
    provenance: "DEMO",
  };

  const utilisateurs: Utilisateur[] = [
    {
      id: "usr-1", companyId: "ent-1", nom: "Fatou Sow", email: "fatou@dakarexpress.sn",
      telephone: "+221 77 111 22 33", role: "OWNER", actif: true,
    },
    {
      id: "usr-2", companyId: "ent-1", nom: "Ibrahima Ba", email: "ibrahima@dakarexpress.sn",
      telephone: "+221 77 222 33 44", role: "DISPATCHER", actif: true,
    },
    {
      id: "usr-3", companyId: "ent-1", nom: "Moussa Diallo", email: "moussa@dakarexpress.sn",
      telephone: "+221 78 987 65 43", role: "DRIVER", driverId: "drv-1", actif: true,
    },
  ];

  const vehicules: Vehicule[] = [
    { id: "veh-1", companyId: "ent-1", libelle: "Moto Yamaha 125", type: "MOTO", immatriculation: "DK-1234-AB" },
    { id: "veh-2", companyId: "ent-1", libelle: "Moto TVS", type: "MOTO", immatriculation: "DK-5678-CD" },
    { id: "veh-3", companyId: "ent-1", libelle: "Camionnette Kia", type: "CAMIONNETTE", immatriculation: "DK-9012-EF" },
  ];

  const livreurs: Livreur[] = [
    { id: "drv-1", companyId: "ent-1", nom: "Moussa Diallo", telephone: "+221 78 987 65 43", matricule: "L-12", vehiculeId: "veh-1", actif: true, createdAt: ilYA(400 * 24 * 60), provenance: "DEMO" },
    { id: "drv-2", companyId: "ent-1", nom: "Abdoulaye Ndiaye", telephone: "+221 76 555 44 33", matricule: "L-07", vehiculeId: "veh-2", actif: true, createdAt: ilYA(300 * 24 * 60), provenance: "DEMO" },
    { id: "drv-3", companyId: "ent-1", nom: "Cheikh Fall", telephone: "+221 70 333 22 11", matricule: "L-21", vehiculeId: "veh-3", actif: true, createdAt: ilYA(200 * 24 * 60), provenance: "DEMO" },
    { id: "drv-4", companyId: "ent-1", nom: "Omar Sy", telephone: "+221 77 444 55 66", matricule: "L-33", vehiculeId: "veh-1", actif: false, createdAt: ilYA(120 * 24 * 60), provenance: "DEMO" },
  ];

  const clients: Client[] = [
    { id: "cli-1", companyId: "ent-1", nom: "Aïssatou Ndiaye", telephone: "+221 77 123 45 67", adresse: adresse({ ligne: "Liberté 6, immeuble bleu après la pharmacie", zone: COORDONNEES.liberte6.zone, repere: "En face de la pharmacie Mermoz", lat: COORDONNEES.liberte6.lat, lng: COORDONNEES.liberte6.lng }), createdAt: ilYA(90 * 24 * 60), provenance: "DEMO" },
    { id: "cli-2", companyId: "ent-1", nom: "Boutique Awa", telephone: "+221 76 222 33 44", adresse: adresse({ ligne: "Rue Carnot, face à la banque", zone: COORDONNEES.plateau.zone, repere: "Porte verte", lat: COORDONNEES.plateau.lat, lng: COORDONNEES.plateau.lng }), createdAt: ilYA(85 * 24 * 60), provenance: "DEMO" },
    { id: "cli-3", companyId: "ent-1", nom: "Pharmacie Mermoz", telephone: "+221 70 555 11 22", adresse: adresse({ ligne: "Avenue Cheikh Anta Diop", zone: COORDONNEES.mermoz.zone, lat: COORDONNEES.mermoz.lat, lng: COORDONNEES.mermoz.lng }), createdAt: ilYA(80 * 24 * 60), provenance: "DEMO" },
    { id: "cli-4", companyId: "ent-1", nom: "Restaurant Le Baobab", telephone: "+221 78 777 88 99", adresse: adresse({ ligne: "Route des Almadies", zone: COORDONNEES.almadies.zone, repere: "Après la station Total", lat: COORDONNEES.almadies.lat, lng: COORDONNEES.almadies.lng }), createdAt: ilYA(70 * 24 * 60), provenance: "DEMO" },
    { id: "cli-5", companyId: "ent-1", nom: "Grossiste Mamadou", telephone: "+221 77 999 00 11", adresse: adresse({ ligne: "Marché Grand Yoff, allée 4", zone: COORDONNEES.grandYoff.zone, repere: "Sous le hangar bleu", lat: COORDONNEES.grandYoff.lat, lng: COORDONNEES.grandYoff.lng }), createdAt: ilYA(60 * 24 * 60), provenance: "DEMO" },
    { id: "cli-6", companyId: "ent-1", nom: "Sokhna Diop", telephone: "+221 76 121 31 41", adresse: adresse({ ligne: "Ouakam, cité Avion", zone: COORDONNEES.ouakam.zone, repere: "Immeuble jaune au fond", lat: COORDONNEES.ouakam.lat, lng: COORDONNEES.ouakam.lng }), createdAt: ilYA(50 * 24 * 60), provenance: "DEMO" },
    { id: "cli-7", companyId: "ent-1", nom: "Cabinet Point E", telephone: "+221 70 606 70 80", adresse: adresse({ ligne: "Point E, rue 6", zone: COORDONNEES.pointE.zone, lat: COORDONNEES.pointE.lat, lng: COORDONNEES.pointE.lng }), createdAt: ilYA(40 * 24 * 60), provenance: "DEMO" },
  ];

  // --- Commandes du jour -------------------------------------------------
  // Répartition volontaire : certaines restent à préparer, d'autres attendent
  // une affectation, d'autres sont déjà en tournée ou terminées.

  const lignes = (spec: [string, number, number][]) =>
    spec.map(([designation, quantite, prixUnitaire], i) => ({
      id: `lig-${designation.slice(0, 3)}-${i}`, designation, quantite, prixUnitaire,
    }));

  type SpecCommande = {
    id: string; ref: string; clientId: string; statut: Commande["statut"];
    lignes: [string, number, number][]; heures: number; minutes?: number;
    livraisonId?: string; note?: string;
  };

  const specs: SpecCommande[] = [
    { id: "cmd-1", ref: "CMD-2418", clientId: "cli-1", statut: "EN_LIVRAISON", lignes: [["Sac de riz 25 kg", 1, 11000], ["Huile 5 L", 1, 1500]], heures: 8, minutes: 12, livraisonId: "liv-1" },
    { id: "cmd-2", ref: "CMD-2417", clientId: "cli-2", statut: "LIVREE", lignes: [["Carton savon", 2, 4000]], heures: 8, minutes: 5, livraisonId: "liv-2" },
    { id: "cmd-3", ref: "CMD-2416", clientId: "cli-3", statut: "AFFECTEE", lignes: [["Boîte gants", 3, 5000]], heures: 9, minutes: 30, livraisonId: "liv-3" },
    { id: "cmd-4", ref: "CMD-2415", clientId: "cli-4", statut: "A_AFFECTER", lignes: [["Pack boissons", 4, 3000], ["Glace 10 kg", 1, 2500]], heures: 10, minutes: 5 },
    { id: "cmd-5", ref: "CMD-2414", clientId: "cli-5", statut: "A_AFFECTER", lignes: [["Sac de sucre 50 kg", 2, 17500]], heures: 10, minutes: 20 },
    { id: "cmd-6", ref: "CMD-2413", clientId: "cli-6", statut: "A_PREPARER", lignes: [["Colis divers", 1, 6500]], heures: 11, minutes: 0, note: "Client absent entre 13h et 15h." },
    { id: "cmd-7", ref: "CMD-2412", clientId: "cli-7", statut: "PRETE", lignes: [["Ramette A4", 5, 2500]], heures: 11, minutes: 25 },
    { id: "cmd-8", ref: "CMD-2411", clientId: "cli-2", statut: "LIVREE", lignes: [["Carton savon", 1, 4000], ["Eau de javel 1 L", 6, 500]], heures: 9, minutes: 0, livraisonId: "liv-4" },
    { id: "cmd-9", ref: "CMD-2410", clientId: "cli-4", statut: "ECHEC", lignes: [["Pack boissons", 2, 3000]], heures: 9, minutes: 15, livraisonId: "liv-5" },
    { id: "cmd-10", ref: "CMD-2409", clientId: "cli-3", statut: "ANNULEE", lignes: [["Boîte masques", 2, 3000]], heures: 8, minutes: 40 },
    { id: "cmd-11", ref: "CMD-2408", clientId: "cli-1", statut: "EN_LIVRAISON", lignes: [["Farine 10 kg", 3, 4000]], heures: 9, minutes: 45, livraisonId: "liv-6" },
    { id: "cmd-12", ref: "CMD-2407", clientId: "cli-5", statut: "AFFECTEE", lignes: [["Huile 20 L", 2, 12000]], heures: 10, minutes: 35, livraisonId: "liv-7" },
  ];

  const commandes: Commande[] = specs.map((s) => {
    const l = lignes(s.lignes);
    const montantAttendu = l.reduce((t, x) => t + x.quantite * x.prixUnitaire, 0);
    // La commande est datée comme les livraisons : vers le passé, jamais à une
    // heure fixe qui pourrait se trouver dans le futur.
    const date = ilYA(400 - s.heures * 10);
    return {
      id: s.id,
      companyId: "ent-1",
      reference: s.ref,
      clientId: s.clientId,
      lignes: l,
      montantAttendu,
      statut: s.statut,
      dateCommande: date,
      livraisonId: s.livraisonId,
      note: s.note,
      createdAt: date,
      updatedAt: date,
      provenance: "DEMO",
    };
  });

  // --- Livraisons --------------------------------------------------------

  const clientParId = (id: string) => clients.find((c) => c.id === id)!;

  type SpecLivraison = {
    id: string; ref: string; commandeId: string; clientId: string;
    destination: { lat: number; lng: number };
    livreurId?: string; statut: Livraison["statut"];
    creeMin: number; assigneeMin?: number; departMin?: number;
    arriveeMin?: number; livreeMin?: number; motifEchec?: string;
    montantAttendu: number; preuveId?: string;
  };

  const specsLiv: SpecLivraison[] = [
    { id: "liv-1", ref: "LIV-1042", commandeId: "cmd-1", clientId: "cli-1", destination: COORDONNEES.liberte6, livreurId: "drv-1", statut: "EN_ROUTE", creeMin: 110, assigneeMin: 105, departMin: 99, montantAttendu: 12500 },
    { id: "liv-2", ref: "LIV-1039", commandeId: "cmd-2", clientId: "cli-2", destination: COORDONNEES.plateau, livreurId: "drv-1", statut: "LIVREE", creeMin: 240, assigneeMin: 235, departMin: 225, arriveeMin: 195, livreeMin: 190, montantAttendu: 8000, preuveId: "pru-1" },
    { id: "liv-3", ref: "LIV-1041", commandeId: "cmd-3", clientId: "cli-3", destination: COORDONNEES.mermoz, livreurId: "drv-2", statut: "AFFECTEE", creeMin: 65, assigneeMin: 60, montantAttendu: 15000 },
    { id: "liv-4", ref: "LIV-1038", commandeId: "cmd-8", clientId: "cli-2", destination: COORDONNEES.plateau, livreurId: "drv-2", statut: "LIVREE", creeMin: 200, assigneeMin: 195, departMin: 185, arriveeMin: 150, livreeMin: 145, montantAttendu: 7000, preuveId: "pru-2" },
    { id: "liv-5", ref: "LIV-1037", commandeId: "cmd-9", clientId: "cli-4", destination: COORDONNEES.almadies, livreurId: "drv-2", statut: "ECHEC", creeMin: 190, assigneeMin: 185, departMin: 175, motifEchec: "Client injoignable, boutique fermée.", montantAttendu: 6000 },
    { id: "liv-6", ref: "LIV-1040", commandeId: "cmd-11", clientId: "cli-1", destination: COORDONNEES.liberte6, livreurId: "drv-3", statut: "EN_ROUTE", creeMin: 45, assigneeMin: 40, departMin: 30, montantAttendu: 12000 },
    { id: "liv-7", ref: "LIV-1043", commandeId: "cmd-12", clientId: "cli-5", destination: COORDONNEES.grandYoff, livreurId: "drv-3", statut: "AFFECTEE", creeMin: 20, assigneeMin: 15, montantAttendu: 24000 },
  ];

  const livraisons: Livraison[] = specsLiv.map((s) => {
    const cli = clientParId(s.clientId);
    return {
      id: s.id,
      companyId: "ent-1",
      reference: s.ref,
      commandeId: s.commandeId,
      clientId: s.clientId,
      adresse: cli.adresse,
      destination: { lat: s.destination.lat, lng: s.destination.lng },
      depart: s.departMin !== undefined ? COORDONNEES.depot : undefined,
      livreurId: s.livreurId,
      statut: s.statut,
      assigneeAt: s.assigneeMin !== undefined ? ilYA(s.assigneeMin) : undefined,
      departAt: s.departMin !== undefined ? ilYA(s.departMin) : undefined,
      arriveeAt: s.arriveeMin !== undefined ? ilYA(s.arriveeMin) : undefined,
      livreeAt: s.livreeMin !== undefined ? ilYA(s.livreeMin) : undefined,
      echecAt: s.statut === "ECHEC" ? ilYA(s.creeMin - 15) : undefined,
      motifEchec: s.motifEchec,
      preuveId: s.preuveId,
      montantAttendu: s.montantAttendu,
      createdAt: ilYA(s.creeMin),
      updatedAt: ilYA(Math.min(s.creeMin, s.livreeMin ?? s.departMin ?? s.creeMin)),
      provenance: "DEMO",
    };
  });

  // --- Positions GPS -----------------------------------------------------
  // Seule la livraison liv-1 reçoit une trace : c'est le scénario « en route ».
  // Les autres n'ont aucune position, ce qui montre honnêtement le cas
  // « position indisponible » plutôt que de simuler un suivi inexistant.

  const positions: PositionGps[] = TRACE_VERS_LIBERTE6.map((r, i) => ({
    id: `pos-1-${i}`,
    companyId: "ent-1",
    livraisonId: "liv-1",
    livreurId: "drv-1",
    lat: r.lat,
    lng: r.lng,
    accuracy: 8 + i,
    recordedAt: ilYA(r.ageMin),
    syncedAt: ilYA(r.ageMin),
    clientId: `cli-pos-1-${i}`,
    provenance: "DEMO",
  }));

  // --- Preuves -----------------------------------------------------------

  const preuves: Preuve[] = [
    {
      id: "pru-1", companyId: "ent-1", livraisonId: "liv-2",
      photoRef: "demo/liv-2-remise.jpg", nomReceptionnaire: "Awa Diagne",
      commentaire: "Remise en main propre au comptoir.",
      position: { lat: COORDONNEES.plateau.lat, lng: COORDONNEES.plateau.lng, accuracy: 12 },
      recordedAt: ilYA(190), syncedAt: ilYA(190), clientId: "cli-pru-1", provenance: "DEMO",
    },
    {
      id: "pru-2", companyId: "ent-1", livraisonId: "liv-4",
      photoRef: "demo/liv-4-remise.jpg", nomReceptionnaire: "Awa Diagne",
      position: { lat: COORDONNEES.plateau.lat, lng: COORDONNEES.plateau.lng, accuracy: 15 },
      recordedAt: ilYA(145), syncedAt: ilYA(145), clientId: "cli-pru-2", provenance: "DEMO",
    },
  ];

  // --- Paiements ---------------------------------------------------------
  // liv-2 et liv-4 : encaissées. liv-1 : à encaisser. On laisse volontairement
  // une livraison livrée sans paiement pour montrer un écart de caisse réel.

  const paiements: Paiement[] = [
    { id: "pay-1", companyId: "ent-1", livraisonId: "liv-2", commandeId: "cmd-2", livreurId: "drv-1", montant: 8000, mode: "WAVE", recordedAt: ilYA(189), syncedAt: ilYA(189), clientId: "cli-pay-1", provenance: "DEMO" },
    { id: "pay-2", companyId: "ent-1", livraisonId: "liv-4", commandeId: "cmd-8", livreurId: "drv-2", montant: 5000, mode: "ESPECES", recordedAt: ilYA(144), syncedAt: ilYA(144), clientId: "cli-pay-2", provenance: "DEMO" },
  ];

  // --- Remises -----------------------------------------------------------

  const remises: Remise[] = [
    { id: "rem-1", companyId: "ent-1", livreurId: "drv-1", montant: 8000, recordedAt: ilYA(60), note: "Remise du matin au bureau.", provenance: "DEMO" },
    { id: "rem-2", companyId: "ent-1", livreurId: "drv-2", montant: 3000, recordedAt: ilYA(45), note: "Remise partielle.", provenance: "DEMO" },
  ];

  // --- Événements --------------------------------------------------------

  const evenements: EvenementLivraison[] = [];
  const ajouter = (
    livraisonId: string,
    horodatage: number,
    type: EvenementLivraison["type"],
    libelle: string,
    origine: EvenementLivraison["origine"],
  ) => {
    evenements.push({
      id: `evt-${evenements.length + 1}`,
      livraisonId,
      horodatage,
      type,
      libelle,
      origine,
      provenance: "DEMO",
    });
  };

  const nomLivreur = (id?: string) => livreurs.find((l) => l.id === id)?.nom ?? "—";

  for (const l of livraisons) {
    ajouter(l.id, l.createdAt, "LIVRAISON_CREEE", `Livraison ${l.reference} créée`, "BUREAU");
    if (l.assigneeAt) ajouter(l.id, l.assigneeAt, "LIVREUR_AFFECTE", `Affectée à ${nomLivreur(l.livreurId)}`, "BUREAU");
    if (l.departAt) ajouter(l.id, l.departAt, "DEPART", "Livreur en route", "TERRAIN");
    if (l.arriveeAt) ajouter(l.id, l.arriveeAt, "ARRIVEE", "Arrivé chez le client", "TERRAIN");
    if (l.livreeAt) ajouter(l.id, l.livreeAt, "LIVRAISON_EFFECTUEE", "Livraison effectuée", "TERRAIN");
    if (l.echecAt) ajouter(l.id, l.echecAt, "ECHEC", `Échec : ${l.motifEchec ?? "motif non précisé"}`, "TERRAIN");
  }

  for (const p of preuves) {
    ajouter(p.livraisonId, p.recordedAt + 1 * MINUTE, "PREUVE_AJOUTEE", "Preuve de livraison enregistrée", "TERRAIN");
  }
  for (const p of paiements) {
    ajouter(p.livraisonId, p.recordedAt, "PAIEMENT_ENREGISTRE", `Paiement enregistré — ${p.montant.toLocaleString("fr-FR")} FCFA (${libelleModeDemo(p.mode)})`, "TERRAIN");
  }

  evenements.sort((a, b) => a.horodatage - b.horodatage);

  return {
    entreprise, utilisateurs, vehicules, livreurs, clients,
    commandes, livraisons, positions, preuves, paiements, remises, evenements,
  };
}

function libelleModeDemo(mode: ModePaiement): string {
  const map: Record<ModePaiement, string> = {
    ESPECES: "Espèces",
    WAVE: "Wave",
    ORANGE_MONEY: "Orange Money",
    FREE_MONEY: "Free Money",
    VIREMENT: "Virement",
    A_CREDIT: "À crédit",
  };
  return map[mode];
}

/** Utilisateur de démonstration connecté au poste de responsable. */
export const UTILISATEUR_DEMO = "usr-1";

/** Livreur de démonstration utilisé par l'application livreur. */
export const LIVREUR_DEMO = "drv-1";
