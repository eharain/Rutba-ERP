import Link from "next/link";
import { CmsFooterInterface } from "@/types/api/cms-page";
import {
  getPageUrl,
  PAGE_TYPES_WITH_LIST,
  PAGE_TYPE_LIST_LABELS,
  PAGE_TYPE_LABELS,
  getListUrlForType,
} from "@/lib/cms-page-types";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { resolveMediaUrl } from "@/lib/media-url";
import { ArrowRight, Mail, MapPin, Phone } from "lucide-react";
import TrackingScripts from "@/components/seo/tracking-scripts";

interface FooterProps {
  footer?: CmsFooterInterface;
}

export default function Footer({ footer: pageFooter }: FooterProps) {
  const settings = useSiteSettings();
  // Fallback chain: page-level footer → site_settings.default_footer.
  // Tracking codes (GA / Pixel / GTM) ride on the resolved footer so
  // site-wide analytics fire even on pages that don't pick a footer.
  const footer = pageFooter || settings.default_footer || undefined;
  const phone = footer?.phone || "+923245303530";
  const openingHours = footer?.opening_hours || [
    { day: "Monday – Thursday", hours: "11am – 9pm" },
    { day: "Friday", hours: "Closed" },
    { day: "Saturday & Sunday", hours: "11am – 9pm" },
  ];
  const socialLinks = footer?.social_links || [];
  const pinnedPages = footer?.pinned_pages || [];
  const copyrightText =
    footer?.copyright_text || `© ${new Date().getFullYear()} ${settings.site_name}. All rights reserved.`;

  return (
    <>
      <TrackingScripts footer={footer} />
      <footer className="bg-foreground text-background mt-20">
      <div className="container-fluid py-16 md:py-20">
        {/* Brand + columns */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-12">
          {/* Brand */}
          <div className="md:col-span-4">
            <Link href="/" className="inline-block">
              {settings.site_logo?.url ? (
                <img
                  src={resolveMediaUrl(settings.site_logo.url)}
                  alt={settings.site_name}
                  className="h-9 w-auto brightness-0 invert"
                />
              ) : (
                <p className="font-display text-2xl font-bold tracking-tight">
                  {settings.site_name}
                </p>
              )}
            </Link>
            {settings.site_tagline && (
              <p className="mt-4 text-background/70 text-sm leading-relaxed max-w-sm">
                {settings.site_tagline}
              </p>
            )}

            <div className="mt-8 space-y-3">
              <a
                href={`tel:${phone}`}
                className="group inline-flex items-center gap-3 text-background/90 hover:text-brand transition-colors"
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-background/10 group-hover:bg-brand/15 transition-colors">
                  <Phone className="h-4 w-4" />
                </span>
                <span className="font-medium">{phone}</span>
              </a>

              {footer?.email && (
                <a
                  href={`mailto:${footer.email}`}
                  className="group flex items-center gap-3 text-background/90 hover:text-brand transition-colors"
                >
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-background/10 group-hover:bg-brand/15 transition-colors">
                    <Mail className="h-4 w-4" />
                  </span>
                  <span className="text-sm">{footer.email}</span>
                </a>
              )}

              {footer?.address && (
                <div className="flex items-start gap-3 text-background/70">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-background/10 mt-0.5 shrink-0">
                    <MapPin className="h-4 w-4" />
                  </span>
                  <span className="text-sm leading-relaxed">
                    {footer.address}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Explore — products + every CMS page type that has a list route */}
          <div className="md:col-span-3">
            <p className="text-xs uppercase tracking-[0.18em] font-bold text-brand">
              Explore
            </p>
            <ul className="mt-5 space-y-3 text-sm">
              <li>
                <FooterLink href="/product">
                  {settings.nav_explore_products_label || "All Products"}
                </FooterLink>
              </li>
              {PAGE_TYPES_WITH_LIST.map((t) => (
                <li key={`pt-${t}`}>
                  <FooterLink href={getListUrlForType(t)}>
                    {PAGE_TYPE_LIST_LABELS[t] || PAGE_TYPE_LABELS[t]}
                  </FooterLink>
                </li>
              ))}
              {pinnedPages.map((pp) => (
                <li key={pp.documentId}>
                  <FooterLink href={getPageUrl(pp)}>{pp.title}</FooterLink>
                </li>
              ))}
            </ul>
          </div>

          {/* Account */}
          <div className="md:col-span-2">
            <p className="text-xs uppercase tracking-[0.18em] font-bold text-brand">
              Account
            </p>
            <ul className="mt-5 space-y-3 text-sm">
              <li>
                <FooterLink href="/login">Login</FooterLink>
              </li>
              <li>
                <FooterLink href="/register">Register</FooterLink>
              </li>
              <li>
                <FooterLink href="/profile">My Profile</FooterLink>
              </li>
              <li>
                <FooterLink href="/profile/orders">Orders</FooterLink>
              </li>
            </ul>
          </div>

          {/* Hours / Social */}
          <div className="md:col-span-3">
            <p className="text-xs uppercase tracking-[0.18em] font-bold text-brand">
              Opening hours
            </p>
            <ul className="mt-5 space-y-2 text-sm text-background/80">
              {openingHours.map((h, i) => (
                <li key={i} className="flex items-baseline justify-between gap-2">
                  <span>{h.day}</span>
                  <span className="text-background/60">{h.hours}</span>
                </li>
              ))}
            </ul>

            {socialLinks.length > 0 && (
              <>
                <p className="mt-8 text-xs uppercase tracking-[0.18em] font-bold text-brand">
                  Follow
                </p>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {socialLinks.map((s, i) => (
                    <li key={i}>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group inline-flex items-center gap-1.5 rounded-full border border-background/15 hover:border-brand bg-background/5 hover:bg-brand text-background/85 hover:text-brand-foreground px-3 py-1.5 text-xs font-medium transition-colors"
                      >
                        {s.platform}
                        <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-14 pt-6 border-t border-background/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-xs text-background/60 m-0">{copyrightText}</p>
          <p className="text-xs text-background/40 m-0">
            Crafted with care.
          </p>
        </div>
      </div>
    </footer>
    </>
  );
}

function FooterLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="text-background/80 hover:text-brand transition-colors"
    >
      {children}
    </Link>
  );
}
