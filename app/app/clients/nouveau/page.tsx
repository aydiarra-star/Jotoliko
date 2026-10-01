"use client";

import { useRouter } from "next/navigation";
import { Carte, EnTetePage } from "@/components/app/partage/ui";
import { FormulaireClient } from "@/components/app/clients/formulaire-client";
import { useMagasin } from "@/lib/magasin";
import { lienDetail } from "@/lib/use-parametre";

export default function NouveauClientPage() {
  const router = useRouter();
  const { creerClient } = useMagasin();

  return (
    <div className="space-y-6">
      <EnTetePage
        titre="Nouveau client"
        description="Renseignez au minimum le nom, le téléphone et l'adresse. Le repère aide le livreur à trouver."
      />
      <Carte>
        <FormulaireClient
          libelleAction="Créer le client"
          onValider={(v) => {
            const r = creerClient(v);
            if (!r.ok) return r.raison;
            const cree = r.valeur.monde.clients.at(-1);
            router.push(cree ? lienDetail("/app/clients/detail", cree.id) : "/app/clients");
            return null;
          }}
          onAnnuler={() => router.push("/app/clients")}
        />
      </Carte>
    </div>
  );
}
