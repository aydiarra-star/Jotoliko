export interface Trip {
  id: string;
  gpName: string;
  gpInitials: string;
  verified: boolean;
  from: string;
  to: string;
  date: string; // YYYY-MM-DD
  dateLabel: string; // DD/MM/YYYY
  pricePerKg: number;
  currency: string;
  availableKg: number;
  note: string;
}

export interface Parcel {
  code: string;
  from: string;
  to: string;
  gpName: string;
  weightKg: number;
  status: "En attente de remise" | "En transit" | "Arrivé à destination";
  deliveryCode: string;
  updatedAt: string;
}

export const DEMO_TRIPS: Trip[] = [
  {
    id: "gp-1",
    gpName: "Mamadou D.",
    gpInitials: "MD",
    verified: true,
    from: "Paris",
    to: "Dakar",
    date: "2026-12-02",
    dateLabel: "02/12/2026",
    pricePerKg: 10,
    currency: "€",
    availableKg: 18,
    note: "Départ Roissy CDG, remise possible à Plateau ou Almadies.",
  },
  {
    id: "gp-2",
    gpName: "Awa N.",
    gpInitials: "AN",
    verified: true,
    from: "Paris",
    to: "Dakar",
    date: "2026-12-05",
    dateLabel: "05/12/2026",
    pricePerKg: 9,
    currency: "€",
    availableKg: 12,
    note: "Collecte Paris 18e / Saint-Denis. Remise en main propre à Dakar.",
  },
  {
    id: "gp-3",
    gpName: "Ibrahima S.",
    gpInitials: "IS",
    verified: true,
    from: "Dakar",
    to: "Paris",
    date: "2026-12-08",
    dateLabel: "08/12/2026",
    pricePerKg: 11,
    currency: "€",
    availableKg: 10,
    note: "Départ AIBD, remise à Paris Gare du Nord ou Châtelet.",
  },
];

export const DEMO_PARCELS: Parcel[] = [
  {
    code: "JC-4821",
    from: "Paris",
    to: "Dakar",
    gpName: "Mamadou D.",
    weightKg: 4,
    status: "En transit",
    deliveryCode: "7394",
    updatedAt: "Aujourd'hui, 10:30",
  },
];

export const PROHIBITED_ITEMS = [
  "Produits inflammables, explosifs ou aérosols sous pression",
  "Stupéfiants, substances illicites ou médicaments sans ordonnance",
  "Armes, munitions ou objets tranchants non autorisés",
  "Espèces, devises non déclarées ou objets de grande valeur sans accord",
  "Denrées périssables non emballées ou liquides en grande quantité",
];
