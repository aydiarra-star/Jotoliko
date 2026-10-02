"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, Marker, Polyline } from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  evaluerFraicheur,
  type Point,
  type PositionFreshness,
} from "@/lib/tracking";

type Statut =
  | "A_ASSIGNER"
  | "AFFECTEE"
  | "EN_ROUTE"
  | "ARRIVE"
  | "LIVREE"
  | "ECHEC"
  | "ANNULEE";

type Props = {
  trace: Point[];
  destination: Point;
  statut: Statut;
  maintenant: number;
  nomLivreur: string;
};

const COULEUR_MARQUEUR: Record<PositionFreshness, string> = {
  FRAICHE: "#2563EB",
  ANCIENNE: "#F59E0B",
  INDISPONIBLE: "#94A3B8",
  AUCUNE_DONNEE: "#94A3B8",
};

function iconeLivreur(couleur: string, libelle: string) {
  return {
    className: "",
    html: `
      <div style="display:flex;align-items:center;gap:6px;transform:translate(-14px,-14px)">
        <span style="display:block;width:28px;height:28px;border-radius:9999px;
          background:${couleur};box-shadow:0 0 0 4px rgba(255,255,255,.9),0 6px 16px rgba(15,23,42,.28);
          border:2px solid #fff"></span>
        <span style="white-space:nowrap;background:#0F172A;color:#fff;font-size:11px;
          font-weight:600;padding:3px 8px;border-radius:6px;
          font-family:Inter,system-ui,sans-serif;box-shadow:0 2px 8px rgba(15,23,42,.2)">${libelle}</span>
      </div>`,
    iconSize: [0, 0] as [number, number],
    iconAnchor: [0, 0] as [number, number],
  };
}

function iconeClient(libelle: string) {
  return {
    className: "",
    html: `
      <div style="display:flex;align-items:center;gap:6px;transform:translate(-14px,-14px)">
        <span style="display:block;width:28px;height:28px;border-radius:8px;
          background:#0F172A;box-shadow:0 0 0 4px rgba(255,255,255,.9),0 6px 16px rgba(15,23,42,.28);
          border:2px solid #fff"></span>
        <span style="white-space:nowrap;background:#fff;color:#0F172A;font-size:11px;
          font-weight:600;padding:3px 8px;border-radius:6px;border:1px solid #E2E8F0;
          font-family:Inter,system-ui,sans-serif">${libelle}</span>
      </div>`,
    iconSize: [0, 0] as [number, number],
    iconAnchor: [0, 0] as [number, number],
  };
}

export function DeliveryMap({ trace, destination, statut, maintenant, nomLivreur }: Props) {
  const conteneur = useRef<HTMLDivElement | null>(null);
  const carte = useRef<LeafletMap | null>(null);
  const marqueurLivreur = useRef<Marker | null>(null);

  useEffect(() => {
    let annule = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (annule || !conteneur.current || carte.current) return;

      const positionActuelle = trace.at(-1);
      const fraicheur = evaluerFraicheur(positionActuelle, maintenant);
      const suiviActif = statut === "EN_ROUTE" || statut === "ARRIVE";

      const c = L.map(conteneur.current, {
        zoomControl: true,
        attributionControl: true,
        scrollWheelZoom: false,
      });

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
      }).addTo(c);

      carte.current = c;
      const points: [number, number][] = [[destination.lat, destination.lng]];

      // Trace réellement enregistrée : la polyligne suit les points relevés.
      if (trace.length > 1) {
        L.polyline(
          trace.map((p) => [p.lat, p.lng] as [number, number]),
          { color: "#2563EB", weight: 4, opacity: 0.9, lineCap: "round" },
        ).addTo(c);
        trace.forEach((p) => points.push([p.lat, p.lng]));
      }

      L.marker([destination.lat, destination.lng], {
        icon: L.divIcon(iconeClient("Client")),
        zIndexOffset: 200,
      }).addTo(c);

      // Marqueur livreur uniquement si une position réelle et non périmée existe.
      if (
        suiviActif &&
        positionActuelle &&
        fraicheur !== "INDISPONIBLE" &&
        fraicheur !== "AUCUNE_DONNEE"
      ) {
        const libelle =
          fraicheur === "FRAICHE"
            ? `${nomLivreur} — en route`
            : `${nomLivreur} — position ancienne`;
        const ml = L.marker([positionActuelle.lat, positionActuelle.lng], {
          icon: L.divIcon(iconeLivreur(COULEUR_MARQUEUR[fraicheur], libelle)),
          zIndexOffset: 400,
        }).addTo(c);
        marqueurLivreur.current = ml;
        points.push([positionActuelle.lat, positionActuelle.lng]);

        // Partie restante : liaison directe, pas une route calculée.
        if (fraicheur === "FRAICHE" && statut === "EN_ROUTE") {
          L.polyline(
            [
              [positionActuelle.lat, positionActuelle.lng],
              [destination.lat, destination.lng],
            ],
            { color: "#64748B", weight: 3, opacity: 0.7, dashArray: "6 8" },
          ).addTo(c);
        }
      }

      if (points.length > 1) {
        c.fitBounds(L.latLngBounds(points).pad(0.28));
      } else {
        c.setView([destination.lat, destination.lng], 14);
      }
    })();

    return () => {
      annule = true;
      carte.current?.remove();
      carte.current = null;
      marqueurLivreur.current = null;
    };
    // La carte est construite une seule fois ; les mises à jour passent par l'effet suivant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const p = trace.at(-1);
    if (p && marqueurLivreur.current) {
      marqueurLivreur.current.setLatLng([p.lat, p.lng]);
    }
  }, [trace]);

  return (
    <div
      ref={conteneur}
      className="h-[380px] w-full overflow-hidden rounded-2xl ring-1 ring-slate-200 md:h-[460px]"
      role="img"
      aria-label="Carte de suivi : position du livreur, trajet enregistré et destination du client"
    />
  );
}

export default DeliveryMap;
