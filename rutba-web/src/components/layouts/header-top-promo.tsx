import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { useState } from "react";

export default function HeaderTopPromo() {
  const settings = useSiteSettings();
  const [dismissed, setDismissed] = useState(false);

  if (!settings.header_promo_enabled || dismissed) return null;

  const promoText = settings.header_promo_text || "";
  const ctaText = settings.header_promo_cta_text || "";
  const ctaUrl = settings.header_promo_cta_url || "#";

  if (!promoText) return null;

  return (
    <div className="container-fluid bg-zinc-950 py-2 text-white">
      <div className="flex justify-between items-center">
        <div className="flex items-center">
          <p className="mb-0 text-xs md:text-sm mr-2">{promoText}</p>
          {ctaText && (
            <Button size="sm" className="text-xs mr-2" asChild>
              <Link href={ctaUrl}>{ctaText}</Link>
            </Button>
          )}
        </div>
        <div className="cursor-pointer" onClick={() => setDismissed(true)}>
          <X />
        </div>
      </div>
    </div>
  );
}
