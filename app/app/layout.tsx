"use client";

import { Loader2 } from "lucide-react";
import { BarreLaterale } from "@/components/app/barre-laterale";
import { FournisseurMagasin, useMagasin } from "@/lib/magasin";

/**
 * Habillage de l'application métier.
 *
 * Le rendu serveur affiche un écran de chargement, remplacé au montage par les
 * données de la session. Sans cette précaution, l'export statique produirait un
 * HTML différent de celui calculé dans le navigateur.
 */
function Coquille({ children }: { children: React.ReactNode }) {
  const { pret } = useMagasin();

  if (!pret) {
    return (
      <div className="grid min-h-screen place-items-center bg-surface">
        <div className="flex items-center gap-3 text-sm text-ink-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Chargement de l&apos;application…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface lg:flex">
      <BarreLaterale />
      <main id="contenu" className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
      </main>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <FournisseurMagasin>
      <Coquille>{children}</Coquille>
    </FournisseurMagasin>
  );
}
