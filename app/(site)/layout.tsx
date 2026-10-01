import { Navbar } from "@/components/ui/navbar";
import { Footer } from "@/components/ui/footer";

/**
 * Habillage du site public.
 *
 * Les URL sont inchangées : le groupe de routes `(site)` n'apparaît pas dans
 * les chemins. Il sert uniquement à séparer l'habillage marketing de
 * l'habillage applicatif, sans dupliquer le layout racine.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <main id="contenu">{children}</main>
      <Footer />
    </>
  );
}
