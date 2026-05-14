import Head from "next/head";
import { useRouter } from "next/router";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { resolveMediaUrl } from "@/lib/media-url";

interface SeoProps {
  /** Page-specific title (without site name) — falls back to default_meta_title / site_name. */
  title?: string;
  /** Page description — falls back to default_meta_description / site_description. */
  description?: string;
  /** Comma-separated or array — merged with default_meta_keywords (deduped). */
  keywords?: string | string[];
  /** Absolute or media-relative image URL for OG/Twitter — falls back to default_og_image. */
  image?: string | { url?: string } | null;
  /** Override path for canonical/OG url. Defaults to router.asPath. */
  path?: string;
  /** Open Graph type: "website" (default), "article" for blog posts, "product" for product pages. */
  type?: "website" | "article" | "product";
  /** If true, emits <meta name="robots" content="noindex,nofollow"> */
  noindex?: boolean;
  /** Extra <Head> children (e.g. JSON-LD scripts). */
  children?: React.ReactNode;
}

/**
 * Drop-in <Seo /> tag. Resolves every field through this chain:
 *   page-level prop → page CMS field → site default → site_name/site_description.
 *
 * Mount once per route — replaces any other <Head><title>… in the same render.
 */
export default function Seo({
  title,
  description,
  keywords,
  image,
  path,
  type = "website",
  noindex = false,
  children,
}: SeoProps) {
  const settings = useSiteSettings();
  const router = useRouter();

  const siteName = settings.site_name || "Rutba";
  const siteUrl = (settings.site_url || "").replace(/\/$/, "");
  const currentPath = path ?? router.asPath ?? "/";
  const canonical = siteUrl ? `${siteUrl}${currentPath.split("?")[0]}` : undefined;

  const resolvedTitle =
    title ||
    settings.default_meta_title ||
    `${siteName}${settings.site_tagline ? ` — ${settings.site_tagline}` : ""}`;
  const fullTitle = title ? `${title} — ${siteName}` : resolvedTitle;

  const cleanText = (s?: string) =>
    s
      ? s
          .replace(/<[^>]+>/g, " ")
          .replace(/[#*_~`>\[\]()!|]/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 200)
      : undefined;

  const resolvedDescription =
    cleanText(description) ||
    cleanText(settings.default_meta_description) ||
    cleanText(settings.site_description) ||
    "";

  const pageKeywords = Array.isArray(keywords)
    ? keywords
    : keywords
    ? keywords.split(",").map((k) => k.trim())
    : [];
  const defaultKeywords = (settings.default_meta_keywords || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  const mergedKeywords = Array.from(
    new Set([...pageKeywords, ...defaultKeywords].filter(Boolean))
  ).join(", ");

  // Image resolution: explicit image > page object > site default_og_image > site_logo
  const rawImage =
    (typeof image === "string" ? image : image?.url) ||
    settings.default_og_image?.url ||
    settings.site_logo?.url ||
    null;
  const ogImage = rawImage ? resolveMediaUrl(rawImage) : null;
  const absoluteOgImage =
    ogImage && siteUrl && !/^https?:\/\//i.test(ogImage)
      ? `${siteUrl}${ogImage}`
      : ogImage;

  const faviconUrl = settings.favicon?.url
    ? resolveMediaUrl(settings.favicon.url)
    : "/favicon.png";

  return (
    <Head>
      <title>{fullTitle}</title>
      {resolvedDescription && (
        <meta name="description" content={resolvedDescription} />
      )}
      {mergedKeywords && <meta name="keywords" content={mergedKeywords} />}
      {noindex && <meta name="robots" content="noindex,nofollow" />}
      {!noindex && <meta name="robots" content="index,follow" />}

      <link rel="shortcut icon" href={faviconUrl} type="image/x-icon" />
      {canonical && <link rel="canonical" href={canonical} />}

      {/* Open Graph */}
      <meta property="og:site_name" content={siteName} />
      <meta property="og:title" content={fullTitle} />
      {resolvedDescription && (
        <meta property="og:description" content={resolvedDescription} />
      )}
      <meta property="og:type" content={type} />
      {canonical && <meta property="og:url" content={canonical} />}
      {absoluteOgImage && <meta property="og:image" content={absoluteOgImage} />}

      {/* Twitter */}
      <meta
        name="twitter:card"
        content={absoluteOgImage ? "summary_large_image" : "summary"}
      />
      {settings.twitter_handle && (
        <meta name="twitter:site" content={settings.twitter_handle} />
      )}
      <meta name="twitter:title" content={fullTitle} />
      {resolvedDescription && (
        <meta name="twitter:description" content={resolvedDescription} />
      )}
      {absoluteOgImage && (
        <meta name="twitter:image" content={absoluteOgImage} />
      )}

      {children}
    </Head>
  );
}
