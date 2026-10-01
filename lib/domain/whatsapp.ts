// Lecture des commandes reçues par WhatsApp.
//
// Au Sénégal, une grande partie des commandes arrive par message. Ce module
// transforme un message collé par le bureau en une proposition de commande,
// que le bureau relit avant de créer quoi que ce soit.
//
// Principe non négociable, identique à celui du suivi GPS : ce module ne devine
// rien. Ce qu'il n'a pas su lire est signalé comme tel, et c'est le bureau qui
// complète. Une commande devinée serait plus dangereuse qu'une commande saisie
// à la main : elle aurait l'apparence de la certitude.
//
// Ce fichier ne dépend ni de React ni du DOM : il doit rester testable seul et
// réutilisable par l'API.

import type { Client } from "./types";

export type MessageWhatsApp = {
  /** Numéro de l'expéditeur, tel que le bureau l'a reçu. */
  expediteur: string;
  texte: string;
  recuAt: number;
};

export type LigneExtraite = {
  designation: string;
  /** Quantité retenue. Vaut 1 quand le message ne la précise pas. */
  quantite: number;
  /**
   * Vrai uniquement quand la quantité a été lue explicitement. Une quantité
   * supposée doit être confirmée par le bureau : l'interface le signale.
   */
  quantiteExplicite: boolean;
};

export type CommandeExtraite = {
  lignes: LigneExtraite[];
  /** Total annoncé par le message, s'il en annonce un. */
  montantAnnonce?: number;
  /** Somme à prévoir pour rendre la monnaie, si le message la mentionne. */
  remiseAnnoncee?: number;
};

export type AnalyseMessage = {
  /** Numéro normalisé, quand il a pu être lu. */
  telephone?: string;
  /** Client existant reconnu par son numéro, s'il y en a un. */
  clientId?: string;
  commande: CommandeExtraite;
  /** Lignes qui ne décrivent pas un article (salutations, politesse). */
  lignesIgnorees: string[];
  /** Ce que le moteur n'a pas su interpréter, à relire par le bureau. */
  nonCompris: string[];
};

// ---------------------------------------------------------------------------
// Numéros de téléphone
// ---------------------------------------------------------------------------

/**
 * Normalise un numéro sénégalais vers `+221XXXXXXXXX`. Accepte les mobiles (7X)
 * et les fixes (3X), tous deux courants chez les clients professionnels.
 * Retourne `undefined` plutôt qu'une valeur approchante : un numéro mal lu
 * enverrait le livreur chez le mauvais client.
 */
export function normaliserNumeroSenegal(brut: string): string | undefined {
  const chiffres = brut.replace(/\D/g, "");
  if (!chiffres) return undefined;

  // 00221771234567 -> 771234567 ; 221771234567 -> 771234567 ; 771234567 tel quel.
  let local = chiffres;
  if (local.startsWith("00221")) local = local.slice(5);
  else if (local.startsWith("221") && local.length === 12) local = local.slice(3);

  // Un numéro sénégalais compte 9 chiffres et commence par 7 (mobile) ou 3 (fixe).
  if (local.length !== 9 || !/^[37]/.test(local)) return undefined;
  return `+221${local}`;
}

/**
 * Numéro mobile sénégalais uniquement.
 *
 * Sert à reconnaître l'expéditeur d'un message WhatsApp : un fixe ne peut pas
 * en envoyer, et l'accepter laisserait croire à une correspondance qui n'en est
 * pas une.
 */
export function normaliserTelephone(brut: string): string | undefined {
  const normalise = normaliserNumeroSenegal(brut);
  return normalise?.startsWith("+2217") ? normalise : undefined;
}

const RE_TELEPHONE = /(?:\+?221|00221)?[\s.-]?(?:\d[\s.-]?){8}\d/g;

function extraireTelephone(texte: string): string | undefined {
  const candidats = texte.match(RE_TELEPHONE) ?? [];
  for (const c of candidats) {
    const normalise = normaliserTelephone(c);
    if (normalise) return normalise;
  }
  return undefined;
}

/** Compare deux numéros indépendamment de leur mise en forme. */
export function memeNumero(a: string, b: string): boolean {
  return normaliserTelephone(a) === normaliserTelephone(b);
}

// ---------------------------------------------------------------------------
// Montants et quantités
// ---------------------------------------------------------------------------

/** « 12 000 FCFA », « 12000f », « 8.500 cfa » -> 12000, 12000, 8500. */
function lireMontant(brut: string): number | undefined {
  const chiffres = brut.replace(/\D/g, "");
  if (!chiffres) return undefined;
  const valeur = Number.parseInt(chiffres, 10);
  return Number.isFinite(valeur) ? valeur : undefined;
}

// Le marqueur monétaire est obligatoire : sans lui, « 2 » serait pris pour un
// montant. Les lookarounds évitent de confondre le « f » de « face » avec le
// franc. Le quantificateur interne est glouton : paresseux, il ne capturerait
// que « 12 » dans « 12 000 FCFA ».
//
// Deux exemplaires du même motif : `.test()` sur une expression globale est
// stateful (`lastIndex`), et un oubli de remise à zéro ferait silencieusement
// sauter des lignes. Le test utilise la version non globale, l'extraction la
// version globale.
const MOTIF_MONTANT = /(?<![a-z])(\d[\d\s.]{0,12}\d|\d)\s*(?:fcfa|cfa|f)(?![a-z])/i;
const RE_MONTANT_G = new RegExp(MOTIF_MONTANT.source, "gi");
const RE_TOTAL = /(?:total|montant|somme|ça\s+fait|ca\s+fait)\D{0,12}(\d[\d\s.]{0,12}\d|\d)/i;
const RE_REMISE = /(?:remise|monnaie|change|à\s+rendre|a\s+rendre)\D{0,12}(\d[\d\s.]{0,12}\d|\d)/i;

/** Quantité explicite : « 2x riz », « riz x2 », « 2 sacs de riz ». */
function lireQuantite(ligne: string): { quantite: number; explicite: boolean; reste: string } {
  const marqueDevant = ligne.match(/^(\d{1,3})\s*[x×]\s*(.+)$/i);
  if (marqueDevant) {
    return {
      quantite: Number.parseInt(marqueDevant[1], 10),
      explicite: true,
      reste: marqueDevant[2].trim(),
    };
  }

  const marqueDerriere = ligne.match(/^(.+?)\s*[x×]\s*(\d{1,3})$/i);
  if (marqueDerriere) {
    return {
      quantite: Number.parseInt(marqueDerriere[2], 10),
      explicite: true,
      reste: marqueDerriere[1].trim(),
    };
  }

  // Entier en tête suivi d'un mot : « 2 sacs de riz ». On refuse les grands
  // nombres, qui sont des montants ou des références, pas des quantités.
  const entierDevant = ligne.match(/^(\d{1,3})\s+(.+)$/);
  if (entierDevant) {
    return {
      quantite: Number.parseInt(entierDevant[1], 10),
      explicite: true,
      reste: entierDevant[2].trim(),
    };
  }

  return { quantite: 1, explicite: false, reste: ligne };
}

// ---------------------------------------------------------------------------
// Politesse
// ---------------------------------------------------------------------------

// Un message réel commence presque toujours par une salutation. La transformer
// en article de commande serait absurde : on la range à part, visiblement.
const MOTS_POLITESSE = new Set([
  "bonjour", "bonsoir", "bsr", "bjr", "salut", "salam", "salaam", "salamalekoum",
  "merci", "svp", "stp", "ok", "daccord", "accord", "jerejef", "nangadef",
  "cava", "ca", "va", "bien", "recu", "hello", "hi", "bonne", "journee",
  "madame", "monsieur", "chef", "frere", "soeur",
  "beaucoup", "tres", "trop", "aussi", "encore", "tout", "tous",
]);

// Une salutation en tête de ligne range la ligne entière du côté de la
// politesse, même si elle est suivie d'un nom ou de mots que l'analyse ne
// connaît pas.
const MOTS_OUVERTURE = new Set([
  "bonjour", "bonsoir", "bsr", "bjr", "salut", "salam", "salaam", "salamalekoum",
  "hello", "hi", "coucou", "nangadef", "jerejef", "asalamalekoum",
]);

// Une phrase se termine par un point, un point d'exclamation ou d'interrogation.
// Les articles, eux, s'écrivent sans ponctuation finale.
const RE_PHRASE = /[.!?…]\s*$/;

// Marqueurs d'une demande rédigée plutôt que d'une liste d'articles. Sans eux,
// « Je voudrais quelque chose » serait proposé comme un article.
const MOTS_DEMANDE = new Set([
  "je", "j", "nous", "vous", "voudrais", "voudrai", "veux", "veut", "voulez",
  "besoin", "faut", "faudrait", "peux", "peut", "pouvez", "pourrais", "pourriez",
  "aimerais", "aimerai", "souhaite", "souhaiterais", "desire", "desirerais",
  "envoyez", "envoyer", "livrez", "livrer", "preparez", "preparer", "commander",
]);

/**
 * Une ligne est-elle une phrase plutôt qu'un article ?
 *
 * C'est le garde-fou le plus important du module. « Je voudrais quelque chose »
 * ressemble à un article si l'on ne regarde que sa forme. Le prendre pour une
 * ligne de commande produirait une commande plausible et fausse — exactement ce
 * que la règle d'honnêteté interdit. Dans le doute, on signale et le bureau
 * tranche.
 */
function estProbablementUnePhrase(ligne: string): boolean {
  if (RE_PHRASE.test(ligne)) return true;
  const mots = sansAccents(ligne.toLowerCase())
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  // Un article est court. Au-delà de huit mots, c'est une demande rédigée.
  if (mots.length > 8) return true;
  return mots.some((m) => MOTS_DEMANDE.has(m));
}

/** « 2x riz », « riz x2 » : une quantité écrite sans ambiguïté. */
function aQuantiteExplicite(ligne: string): boolean {
  return /^\d{1,3}\s*[x×]\s*\S/i.test(ligne) || /\S\s*[x×]\s*\d{1,3}$/i.test(ligne);
}

function sansAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function estPolitesse(ligne: string): boolean {
  const mots = sansAccents(ligne.toLowerCase())
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (mots.length === 0) return true;

  // Un message s'ouvre presque toujours par une salutation, souvent suivie du
  // nom du destinataire : « Bonjour Jotoliko ». Sans cette règle, la salutation
  // deviendrait une ligne de commande — un article plausible et faux.
  if (MOTS_OUVERTURE.has(mots[0])) return true;

  // Sinon, une ligne de politesse n'est faite que de politesse, et reste courte.
  return mots.length <= 4 && mots.every((m) => MOTS_POLITESSE.has(m));
}

// ---------------------------------------------------------------------------
// Analyse
// ---------------------------------------------------------------------------

/**
 * Analyse un message et en tire une proposition de commande.
 *
 * `clients` sert uniquement à reconnaître un expéditeur déjà connu. Aucun
 * client n'est créé ici : le bureau décide.
 */
export function analyserMessage(message: MessageWhatsApp, clients: Client[] = []): AnalyseMessage {
  const telephone = extraireTelephone(message.texte) ?? extraireTelephone(message.expediteur);
  const client = telephone
    ? clients.find((c) => memeNumero(c.telephone, telephone))
    : undefined;

  const nonCompris: string[] = [];
  const lignesIgnorees: string[] = [];
  const lignes: LigneExtraite[] = [];

  const brut = message.texte.replace(/\r/g, "");
  const lignesTexte = brut
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Le numéro lui-même n'est pas un article : on l'écarte de la lecture.
  const lignesUtiles = lignesTexte.filter((l) => {
    const tel = extraireTelephone(l);
    if (tel && normaliserTelephone(l.replace(/\D/g, ""))) {
      const reste = l.replace(RE_TELEPHONE, "").replace(/[^a-zà-ÿ]/gi, "").trim();
      if (!reste) return false;
    }
    return true;
  });

  for (const ligne of lignesUtiles) {
    if (estPolitesse(ligne)) {
      lignesIgnorees.push(ligne);
      continue;
    }

    const porteTotal = RE_TOTAL.test(ligne);
    const porteRemise = RE_REMISE.test(ligne);
    // Une ligne qui porte un montant sans article décrit un total ou une remise,
    // pas un article. On la signale plutôt que d'en faire une ligne de commande.
    const porteMontant = MOTIF_MONTANT.test(ligne);

    if (porteTotal || porteRemise || porteMontant) {
      if (!porteTotal && !porteRemise) nonCompris.push(ligne);
      continue;
    }

    // Une quantité écrite sans ambiguïté (« 2x riz ») lève toute hésitation.
    if (!aQuantiteExplicite(ligne) && estProbablementUnePhrase(ligne)) {
      nonCompris.push(ligne);
      continue;
    }

    const { quantite, explicite, reste } = lireQuantite(ligne);
    if (!reste.trim()) {
      nonCompris.push(ligne);
      continue;
    }
    lignes.push({ designation: reste.trim(), quantite, quantiteExplicite: explicite });
  }

  const montantAnnonce = extraireMontantTotal(message.texte);
  const remiseAnnoncee = extraireRemise(message.texte);

  return {
    telephone,
    clientId: client?.id,
    commande: { lignes, montantAnnonce, remiseAnnoncee },
    lignesIgnorees,
    nonCompris,
  };
}

function extraireMontantTotal(texte: string): number | undefined {
  const total = texte.match(RE_TOTAL);
  if (total) {
    const v = lireMontant(total[1]);
    if (v !== undefined) return v;
  }
  // À défaut d'un mot « total », le premier montant en devise fait office de
  // total annoncé. Il est présenté comme tel au bureau, qui tranche.
  RE_MONTANT_G.lastIndex = 0;
  const montants = texte.match(RE_MONTANT_G) ?? [];
  RE_MONTANT_G.lastIndex = 0;
  for (const m of montants) {
    const v = lireMontant(m);
    if (v !== undefined) return v;
  }
  return undefined;
}

function extraireRemise(texte: string): number | undefined {
  const m = texte.match(RE_REMISE);
  if (!m) return undefined;
  return lireMontant(m[1]);
}
