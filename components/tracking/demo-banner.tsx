import { FlaskConical } from "lucide-react";

/**
 * Bandeau signalant explicitement que les données affichées sont fictives.
 * Il doit rester visible sur tout écran alimenté par lib/demo.ts, pour qu'aucun
 * visiteur ne prenne ces chiffres pour des statistiques réelles de Jotoliko.
 */
export function DemoBanner({ precision }: { precision?: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <div className="flex items-start gap-3">
        <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
        <p className="text-sm leading-relaxed text-amber-900">
          <span className="font-semibold">Mode démonstration.</span>{" "}
          {precision ??
            "Les livraisons, positions et montants affichés ici sont fictifs et servent uniquement à présenter l'interface."}
        </p>
      </div>
    </div>
  );
}

export default DemoBanner;
