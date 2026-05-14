import Head from "next/head";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { resolveMediaUrl } from "@/lib/media-url";

/**
 * Site-wide JSON-LD: Organization + WebSite (with search action).
 * Emitted once at the app level so every page contributes consistent
 * site graph data to crawlers.
 */
export default function SiteJsonLd() {
  const settings = useSiteSettings();
  const siteUrl = (settings.site_url || "").replace(/\/$/, "");
  if (!siteUrl) return null;

  const logoUrl = settings.site_logo?.url
    ? resolveMediaUrl(settings.site_logo.url)
    : null;
  const absoluteLogo =
    logoUrl && !/^https?:\/\//i.test(logoUrl) ? `${siteUrl}${logoUrl}` : logoUrl;

  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: settings.site_name,
    url: siteUrl,
    ...(absoluteLogo ? { logo: absoluteLogo } : {}),
    ...(settings.twitter_handle
      ? { sameAs: [`https://twitter.com/${settings.twitter_handle.replace(/^@/, "")}`] }
      : {}),
  };

  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: settings.site_name,
    url: siteUrl,
    potentialAction: {
      "@type": "SearchAction",
      target: `${siteUrl}/product?search={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <Head>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(website) }}
      />
    </Head>
  );
}
