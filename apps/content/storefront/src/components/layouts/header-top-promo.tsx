import { ArrowRight, X } from "lucide-react";
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
    <div className="bg-foreground text-background relative">
      <div className="container-fluid">
        <div className="flex items-center justify-center gap-4 py-2.5 text-center text-[12px] md:text-sm tracking-wide">
          <p className="m-0">{promoText}</p>
          {ctaText && (
            <Link
              href={ctaUrl}
              className="group inline-flex items-center gap-1 font-semibold text-brand hover:text-background transition-colors whitespace-nowrap"
            >
              {ctaText}
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          )}
          <button
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            className="absolute right-3 md:right-6 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded-full text-background/60 hover:text-background hover:bg-background/10 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
