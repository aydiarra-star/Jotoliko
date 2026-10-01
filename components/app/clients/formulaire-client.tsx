"use client";

// Formulaire client, partagé par la création et la modification.
//
// Comme les autres formulaires de l'application, il ne porte aucune règle
// métier : il collecte la saisie et laisse le domaine refuser ce qui doit
// l'être, en affichant la raison telle quelle.
//
// L'adresse est le point sensible. Au Sénégal elle est souvent approximative :
// le champ texte et le repère humain sont donc privilégiés, et le point GPS
// reste optionnel. Un client sans GPS est créé quand même ; c'est la création
// de sa livraison qui sera refusée, avec une explication.

import { useState } from "react";
import { Champ, CLASSE_SAISIE, MessageRefus } from "@/components/app/partage/ui";
import type { Adresse } from "@/lib/domain/types";

export type SaisieClient = {
  nom: string;
  telephone: string;
  adresse: Adresse;
  note?: string;
};

export function FormulaireClient({
  initial,
  libelleAction,
  onValider,
  onAnnuler,
}: {
  initial?: SaisieClient;
  libelleAction: string;
  onValider: (valeur: SaisieClient) => string | null;
  onAnnuler: () => void;
}) {
  const [nom, setNom] = useState(initial?.nom ?? "");
  const [telephone, setTelephone] = useState(initial?.telephone ?? "");
  const [ligne, setLigne] = useState(initial?.adresse.ligne ?? "");
  const [zone, setZone] = useState(initial?.adresse.zone ?? "");
  const [ville, setVille] = useState(initial?.adresse.ville ?? "Dakar");
  const [repere, setRepere] = useState(initial?.adresse.repere ?? "");
  const [lat, setLat] = useState(initial?.adresse.lat?.toString() ?? "");
  const [lng, setLng] = useState(initial?.adresse.lng?.toString() ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [erreur, setErreur] = useState<string | null>(null);

  // Une latitude sans longitude (ou l'inverse) ne décrit aucun point. On refuse
  // la paire incomplète plutôt que d'enregistrer un lieu qui n'existe pas.
  const latNum = lat.trim() ? Number(lat) : undefined;
  const lngNum = lng.trim() ? Number(lng) : undefined;
  const paireIncomplete =
    (latNum !== undefined && lngNum === undefined) ||
    (latNum === undefined && lngNum !== undefined);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (paireIncomplete) {
          setErreur("Renseignez la latitude et la longitude ensemble, ou laissez les deux vides.");
          return;
        }
        const raison = onValider({
          nom: nom.trim(),
          telephone: telephone.trim(),
          adresse: {
            ligne: ligne.trim(),
            zone: zone.trim(),
            ville: ville.trim() || "Dakar",
            repere: repere.trim() || undefined,
            lat: latNum,
            lng: lngNum,
          },
          note: note.trim() || undefined,
        });
        setErreur(raison);
      }}
      className="space-y-5"
    >
      {erreur ? <MessageRefus message={erreur} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Champ label="Nom du client">
          <input
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder="Aïssatou Ndiaye"
            className={CLASSE_SAISIE}
          />
        </Champ>
        <Champ label="Téléphone" aide="Mobile de préférence : c'est le numéro appelé par le livreur.">
          <input
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
            placeholder="+221 77 123 45 67"
            inputMode="tel"
            className={CLASSE_SAISIE}
          />
        </Champ>
      </div>

      <Champ label="Adresse" aide="Écrivez comme vous la diriez au téléphone.">
        <input
          value={ligne}
          onChange={(e) => setLigne(e.target.value)}
          placeholder="Liberté 6, immeuble bleu après la pharmacie"
          className={CLASSE_SAISIE}
        />
      </Champ>

      <div className="grid gap-4 sm:grid-cols-2">
        <Champ label="Zone ou quartier">
          <input
            value={zone}
            onChange={(e) => setZone(e.target.value)}
            placeholder="Mermoz"
            className={CLASSE_SAISIE}
          />
        </Champ>
        <Champ label="Ville">
          <input
            value={ville}
            onChange={(e) => setVille(e.target.value)}
            placeholder="Dakar"
            className={CLASSE_SAISIE}
          />
        </Champ>
      </div>

      <Champ
        label="Repère (optionnel)"
        aide="Ce que le livreur voit en arrivant : « en face de la pharmacie », « porte verte »."
      >
        <input
          value={repere}
          onChange={(e) => setRepere(e.target.value)}
          placeholder="En face de la pharmacie Mermoz"
          className={CLASSE_SAISIE}
        />
      </Champ>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-ink-700">
          Position GPS (optionnel)
        </legend>
        <p className="text-xs text-ink-500">
          Sans position, les commandes de ce client restent possibles mais leur livraison ne pourra
          pas être créée. Le livreur utilisera l&apos;adresse et le repère.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ label="Latitude">
            <input
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder="14.7167"
              inputMode="decimal"
              className={CLASSE_SAISIE}
            />
          </Champ>
          <Champ label="Longitude">
            <input
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              placeholder="-17.4677"
              inputMode="decimal"
              className={CLASSE_SAISIE}
            />
          </Champ>
        </div>
      </fieldset>

      <Champ label="Note (optionnel)">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Préférence de livraison, disponibilité…"
          className={CLASSE_SAISIE}
        />
      </Champ>

      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-primary text-sm">
          {libelleAction}
        </button>
        <button type="button" onClick={onAnnuler} className="btn-ghost text-sm">
          Annuler
        </button>
      </div>
    </form>
  );
}
