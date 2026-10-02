import {
  BarChart3,
  Bike,
  Camera,
  ClipboardList,
  MapPin,
  Pill,
  Route,
  ShoppingBag,
  Smartphone,
  Store,
  Truck,
  UtensilsCrossed,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";

const registry: Record<string, LucideIcon> = {
  BarChart3,
  Bike,
  Camera,
  ClipboardList,
  MapPin,
  Pill,
  Route,
  ShoppingBag,
  Smartphone,
  Store,
  Truck,
  UtensilsCrossed,
  Wallet,
  Wrench,
};

export function Icon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const Cmp = registry[name] ?? ClipboardList;
  return <Cmp className={className} aria-hidden strokeWidth={1.75} />;
}
