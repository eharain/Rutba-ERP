import Link from "next/link";
import { CmsFooterInterface } from "@/types/api/cms-page";
import { getPageUrl } from "@/lib/cms-page-types";
import { useSiteSettings } from "@/hooks/use-site-settings";

interface FooterProps {
  footer?: CmsFooterInterface;
}

export default function Footer({ footer }: FooterProps) {
  const settings = useSiteSettings();
  const phone = footer?.phone || "+923245303530";
  const openingHours = footer?.opening_hours || [
    { day: "Monday to Thursday", hours: "11am - 9pm" },
    { day: "Friday", hours: "Closed" },
    { day: "Saturday and Sunday", hours: "11am - 9pm" },
  ];
  const socialLinks = footer?.social_links || [];
  const pinnedPages = footer?.pinned_pages || [];
  const copyrightText = footer?.copyright_text || `© ${new Date().getFullYear()}. ${settings.site_name}`;

  return (
    <footer className="bg-slate-100 lg:grid lg:grid-cols-5">
      <div className="px-4 py-16 sm:px-6 lg:col-span-5 lg:px-8">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
          <div>
            <p>
              <span className="text-xs uppercase tracking-wide text-gray-500">
                Call us
              </span>

              <a
                href={`tel:${phone}`}
                className="block text-2xl font-medium text-gray-900 hover:opacity-75 sm:text-3xl"
              >
                {phone}
              </a>
            </p>

            {footer?.email && (
              <p className="mt-2">
                <a href={`mailto:${footer.email}`} className="text-sm text-gray-700 hover:opacity-75">
                  {footer.email}
                </a>
              </p>
            )}

            {footer?.address && (
              <p className="mt-2 text-sm text-gray-700">{footer.address}</p>
            )}

            <ul className="mt-8 space-y-1 text-sm text-gray-700">
              {openingHours.map((h, i) => (
                <li key={i}>{h.day}: {h.hours}</li>
              ))}
            </ul>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="font-medium text-gray-900">Link</p>

              <ul className="mt-6 space-y-4 text-sm">
                <li>
                  <Link
                    href="/product"
                    className="text-gray-700 transition hover:opacity-75"
                  >
                        {settings.nav_explore_products_label || "Explore Products"}
                      </Link>
                    </li>

                    {pinnedPages.map((pp) => (
                  <li key={pp.documentId}>
                    <Link
                      href={getPageUrl(pp)}
                      className="text-gray-700 transition hover:opacity-75"
                    >
                      {pp.title}
                    </Link>
                  </li>
                ))}

                <li>
                  <Link
                    href="/blog"
                    className="text-gray-700 transition hover:opacity-75"
                  >
                    Blog
                  </Link>
                </li>

                <li>
                  <Link
                    href="/login"
                    className="text-gray-700 transition hover:opacity-75"
                  >
                    Login
                  </Link>
                </li>

                <li>
                  <Link
                    href="/register"
                    className="text-gray-700 transition hover:opacity-75"
                  >
                    Register
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <p className="font-medium text-gray-900">Social Media</p>

              <ul className="mt-6 space-y-4 text-sm">
                {socialLinks.map((s, i) => (
                  <li key={i}>
                    <a
                      href={s.url}
                      className="text-gray-700 transition hover:opacity-75"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {s.platform}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-12 border-t border-gray-100 pt-12">
          <div className="sm:flex sm:items-center sm:justify-between">
            <p className="mt-8 text-xs text-gray-500 sm:mt-0">
              {copyrightText}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
