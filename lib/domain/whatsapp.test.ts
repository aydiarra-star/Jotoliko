// Tests de la lecture des commandes WhatsApp.
//
// L'enjeu n'est pas de « bien deviner » mais de ne jamais inventer. Chaque test
// vérifie donc surtout ce que le moteur refuse de comprendre, et le fait qu'il
// le signale.

import { describe, expect, it } from "vitest";
import {
  analyserMessage,
  memeNumero,
  normaliserTelephone,
} from "./whatsapp";
import type { Client } from "./types";

const T0 = 1_800_000_000_000;

const message = (texte: string, expediteur = "") => ({ texte, expediteur, recuAt: T0 });

const client = (id: string, nom: string, telephone: string): Client => ({
  id,
  companyId: "ent-1",
  nom,
  telephone,
  adresse: { ligne: "Liberté 6", zone: "Liberté 6", ville: "Dakar" },
  createdAt: T0,
  provenance: "DEMO",
});

describe("normaliserTelephone", () => {
  it("accepte les formes sénégalaises courantes", () => {
    expect(normaliserTelephone("+221 77 123 45 67")).toBe("+221771234567");
    expect(normaliserTelephone("00221771234567")).toBe("+221771234567");
    expect(normaliserTelephone("221771234567")).toBe("+221771234567");
    expect(normaliserTelephone("77 123 45 67")).toBe("+221771234567");
  });

  it("refuse un numéro qu'il ne peut pas reconstituer", () => {
    // Mieux vaut refuser que d'envoyer un livreur chez le mauvais client.
    expect(normaliserTelephone("+221 33 123 45 67")).toBeUndefined();
    expect(normaliserTelephone("12345")).toBeUndefined();
    expect(normaliserTelephone("")).toBeUndefined();
  });

  it("compare deux écritures du même numéro", () => {
    expect(memeNumero("+221 77 123 45 67", "00221771234567")).toBe(true);
    expect(memeNumero("+221771234567", "+221761234567")).toBe(false);
  });
});

describe("analyserMessage", () => {
  it("extrait les articles d'un message structuré", () => {
    const r = analyserMessage(
      message("Bonjour\n2x sac de riz\n1x huile 5L\nTotal 12 000 FCFA"),
    );
    expect(r.commande.lignes).toEqual([
      { designation: "sac de riz", quantite: 2, quantiteExplicite: true },
      { designation: "huile 5L", quantite: 1, quantiteExplicite: true },
    ]);
    expect(r.commande.montantAnnonce).toBe(12000);
  });

  it("range la politesse à part au lieu d'en faire des articles", () => {
    const r = analyserMessage(message("Bonjour\nMerci beaucoup\n2x riz"));
    expect(r.lignesIgnorees).toEqual(["Bonjour", "Merci beaucoup"]);
    expect(r.commande.lignes).toHaveLength(1);
  });

  it("signale comme non compris ce qu'il ne sait pas lire", () => {
    const r = analyserMessage(message("Bonjour\nJe voudrais quelque chose\n3x riz"));
    expect(r.nonCompris).toContain("Je voudrais quelque chose");
    // Le reste est lu malgré tout : le bureau complète, il ne ressaisit pas tout.
    expect(r.commande.lignes[0].designation).toBe("riz");
  });

  it("marque une quantité supposée comme non explicite", () => {
    const r = analyserMessage(message("Bonjour\nhuile 5L\nsavon"));
    expect(r.commande.lignes.every((l) => l.quantiteExplicite === false)).toBe(true);
    expect(r.commande.lignes.every((l) => l.quantite === 1)).toBe(true);
  });

  it("reconnaît le client existant par son numéro", () => {
    const clients = [client("cli-1", "Aïssatou Ndiaye", "+221 77 123 45 67")];
    const r = analyserMessage(
      message("Bonjour\n2x riz", "+221771234567"),
      clients,
    );
    expect(r.telephone).toBe("+221771234567");
    expect(r.clientId).toBe("cli-1");
  });

  it("ne rattache aucun client quand le numéro est inconnu", () => {
    const clients = [client("cli-1", "Aïssatou Ndiaye", "+221 77 123 45 67")];
    const r = analyserMessage(message("Bonjour\n2x riz", "+221781111111"), clients);
    expect(r.clientId).toBeUndefined();
    // Le numéro reste connu : le bureau peut créer la fiche à partir de lui.
    expect(r.telephone).toBe("+221781111111");
  });

  it("lit une remise annoncée", () => {
    const r = analyserMessage(message("2x riz\nRemise 5 000 FCFA"));
    expect(r.commande.remiseAnnoncee).toBe(5000);
  });

  it("ne confond pas un prix avec une quantité", () => {
    // « 1 500 FCFA » est un montant : en faire « 1 » article serait faux.
    const r = analyserMessage(message("Riz parfumé 1 500 FCFA"));
    expect(r.commande.lignes).toHaveLength(0);
    expect(r.nonCompris).toContain("Riz parfumé 1 500 FCFA");
  });

  it("n'invente aucun article sur un message vide", () => {
    const r = analyserMessage(message(""));
    expect(r.commande.lignes).toEqual([]);
    expect(r.commande.montantAnnonce).toBeUndefined();
  });

  it("ne prend pas le numéro de téléphone pour un article", () => {
    const r = analyserMessage(message("Bonjour\n77 123 45 67\n2x riz"));
    expect(r.commande.lignes).toHaveLength(1);
    expect(r.commande.lignes[0].designation).toBe("riz");
  });

  it("lit la quantité écrite après l'article", () => {
    const r = analyserMessage(message("Bonjour\nriz x2\nsavon x3"));
    expect(r.commande.lignes).toEqual([
      { designation: "riz", quantite: 2, quantiteExplicite: true },
      { designation: "savon", quantite: 3, quantiteExplicite: true },
    ]);
  });

  it("n'utilise pas le numéro de commande comme montant", () => {
    const r = analyserMessage(message("Bonjour\n2x riz\nCommande CMD-2418"));
    // Aucun montant en devise : rien ne doit être annoncé comme total.
    expect(r.commande.montantAnnonce).toBeUndefined();
  });

  it("ne transforme pas une salutation suivie d'un nom en article", () => {
    // « Bonjour Jotoliko » est une salutation, pas un article de commande.
    const r = analyserMessage(message("Bonjour Jotoliko\n2x riz"));
    expect(r.commande.lignes.map((l) => l.designation)).toEqual(["riz"]);
    expect(r.lignesIgnorees).toContain("Bonjour Jotoliko");
  });

  it("ecarte une salutation meme si le nom du commercant suit", () => {
    const r = analyserMessage(message("Bonsoir Boutique Awa\n1x huile"));
    expect(r.commande.lignes.map((l) => l.designation)).toEqual(["huile"]);
  });

  it("signale un produit manquant sans l'inventer", () => {
    // Message typique du terrain : une adresse, une date, mais aucun article.
    const r = analyserMessage(
      message("Bonjour, livrez à Aïssatou à Parcelles demain."),
    );
    expect(r.commande.lignes).toHaveLength(0);
    expect(r.informationsManquantes.map((m) => m.code)).toContain("PRODUIT");
    expect(r.informationsManquantes.map((m) => m.libelle)).toContain("Produit");
  });

  it("signale un montant manquant sans l'inventer", () => {
    const r = analyserMessage(message("Bonjour\n2x riz"));
    expect(r.informationsManquantes.map((m) => m.code)).toContain("MONTANT");
  });

  it("ne signale rien quand le produit et le montant sont présents", () => {
    const r = analyserMessage(message("Bonjour\n2x riz\nTotal 12 000 FCFA"));
    expect(r.informationsManquantes).toHaveLength(0);
  });

  it("conserve une zone pour ce qui n'a pas été compris", () => {
    const r = analyserMessage(
      message("Bonjour\n2x riz\nTotal 12 000 FCFA\nJe voudrais aussi quelque chose"),
    );
    expect(r.nonCompris.length).toBeGreaterThan(0);
    expect(r.commande.lignes.map((l) => l.designation)).toEqual(["riz"]);
  });

  it("ne range pas une demande de livraison du côté de la politesse", () => {
    // « Bonjour » ouvre la phrase, mais la suite est une instruction : la
    // perdre comme salutation ferait disparaître une vraie demande client.
    const r = analyserMessage(
      message("Bonjour, livrez à Aïssatou à Parcelles demain."),
    );
    expect(r.lignesIgnorees).toHaveLength(0);
    // Elle n'est pas exploitable telle quelle : elle doit remonter comme non
    // comprise, pas être avalée en silence.
    expect(r.nonCompris.length).toBeGreaterThan(0);
  });

  it("ecarte toujours une salutation seule", () => {
    const r = analyserMessage(message("Bonjour Jotoliko\n2x riz\nTotal 5 000 FCFA"));
    expect(r.lignesIgnorees).toContain("Bonjour Jotoliko");
    expect(r.nonCompris).toHaveLength(0);
  });
});
