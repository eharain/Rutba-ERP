import Head from "next/head";
import { useRouter } from "next/router";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { resolveMediaUrl } from "@/lib/media-url";

/** Anything Strapi hands back for a media field. */
export interface SeoImage {
  url?: string;
  width?: number | null;
  height?: number | null;
  alternativeText?: string | null;
  mime?: string | null;
}

/** Commerce facts that turn a link preview into a product card. */
export interface SeoProduct {
  price?: number | null;
  currency?: string;
  /** Open Graph vocabulary: "instock" | "oos" | "preorder". */
  availability?: "instock" | "oos" | "preorder";
  brand?: string | null;
  sku?: string | null;
  condition?: "new" | "refurbished" | "used";
}

interface SeoProps {
  /** Page-specific title (without site name) — falls back to default_meta_title / site_name. */
  title?: string;
  /** Page description — falls back to default_meta_description / site_description. */
  description?: string;
  /** Comma-separated or array — merged with default_meta_keywords (deduped). */
  keywords?: string | string[];
  /** Absolute or media-relative image URL for OG/Twitter — falls back to default_og_image. */
  image?: string | SeoImage | null;
  /**
   * Extra images (a product gallery). Emitted as additional og:image tags after
   * the primary one, so a shopper picking a photo on Facebook or Pinterest gets
   * the whole set instead of the first shot.
   */
  images?: SeoImage[] | null;
  /** Override path for canonical/OG url. Defaults to router.asPath. */
  path?: string;
  /** Open Graph type: "website" (default), "article" for blog posts, "product" for product pages. */
  type?: "website" | "article" | "product";
  /** Price/availability facts. Only emitted when type === "product". */
  product?: SeoProduct | null;
  /** If true, emits <meta name="robots" content="noindex,nofollow"> */
  noindex?: boolean;
  /** Extra <Head> children (e.g. JSON-LD scripts). */
  children?: React.ReactNode;
}

// How many gallery images to advertise. Facebook lets the poster pick between
// them; past a handful it is a scroll, not a choice, and every extra tag is one
// more image the scraper fetches before it will render the card.
const MAX_OG_IMAGES = 4;

/**
 * Drop-in <Seo /> tag. Resolves every field through this chain:
 *   page-level prop → page CMS field → site default → site_name/site_description.
 *
 * Mount once per route — replaces any other <Head><title>… in the same render.
 *
 * A note on why this emits more than the obvious four tags: the platforms that
 * matter for sharing do not read the message a person types. Facebook dropped
 * `quote`, LinkedIn never had it — both render whatever the destination's Open
 * Graph block says. So the card a shopper sees is composed here, not in the
 * share sheet, and the dimensions matter as much as the image: without
 * og:image:width/height the scraper has to fetch and measure the file before it
 * will commit to a large card, and the first share of a new product often
 * renders as a thumbnail because the crawler gave up waiting.
 */
export default function Seo({
  title,
  description,
  keywords,
  image,
  images,
  path,
  type = "website",
  product,
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

  // Relative media URLs have to be made absolute: a crawler resolves og:image
  // against nothing, so "/uploads/x.png" is simply dropped.
  const absolute = (url?: string | null) => {
    if (!url) return null;
    const resolved = resolveMediaUrl(url);
    if (!resolved) return null;
    if (/^https?:\/\//i.test(resolved)) return resolved;
    return siteUrl ? `${siteUrl}${resolved}` : null;
  };

  // Image resolution: explicit image > gallery > site default_og_image > logo.
  const primary: SeoImage | null =
    (typeof image === "string" ? { url: image } : image) ||
    images?.[0] ||
    settings.default_og_image ||
    settings.site_logo ||
    null;

  const primaryUrl = absolute(primary?.url);

  // Everything after the primary, deduped by resolved URL so a product whose
  // logo is also its first gallery shot doesn't advertise the same file twice.
  const seenImages = new Set([primaryUrl].filter(Boolean) as string[]);
  const extraImages = (images ?? [])
    .map((img) => ({ ...img, absoluteUrl: absolute(img.url) }))
    .filter((img) => {
      if (!img.absoluteUrl || seenImages.has(img.absoluteUrl)) return false;
      seenImages.add(img.absoluteUrl);
      return true;
    })
    .slice(0, MAX_OG_IMAGES - 1);

  const primaryAlt = primary?.alternativeText || title || siteName;

  const faviconUrl = settings.favicon?.url
    ? resolveMediaUrl(settings.favicon.url)
    : "/favicon.png";

  const isProduct = type === "product" && !!product;
  const priceText =
    isProduct && typeof product?.price === "number" && product.price > 0
      ? product.price.toFixed(2)
      : null;
  const currency = product?.currency || "PKR";

  // og:title carries no site name: og:site_name already states it, and the
  // page <title> suffix would make a share card read "Butterfly Cape | Rutba.pk
  // — Rutba.pk" whenever an editor put the brand in seo_meta too.
  const socialTitle = title || resolvedTitle;

  return (
    <Head>
      <title>{fullTitle}</title>
      {resolvedDescription && (
        <meta key="description" name="description" content={resolvedDescription} />
      )}
      {mergedKeywords && <meta key="keywords" name="keywords" content={mergedKeywords} />}
      <meta key="robots" name="robots" content={noindex ? "noindex,nofollow" : "index,follow"} />

      <link key="favicon" rel="shortcut icon" href={faviconUrl} type="image/x-icon" />
      {canonical && <link key="canonical" rel="canonical" href={canonical} />}

      {/* Open Graph.
          EVERY tag here carries a `key`, and that is load-bearing rather than
          tidy. _app.tsx mounts a site-wide <Seo /> and each page mounts its
          own; next/head only de-duplicates <meta> by `name`, never by
          `property`, so without keys both blocks survive and a scraper takes
          the FIRST og:image and og:title it sees — the site logo, on every
          product ever shared. With keys next/head keeps the later (page-level)
          tag and drops the default. Keys must also be unique WITHIN this block,
          which is why the gallery images key off their URL. */}
      <meta key="og:site_name" property="og:site_name" content={siteName} />
      <meta key="og:title" property="og:title" content={socialTitle} />
      {resolvedDescription && (
        <meta key="og:description" property="og:description" content={resolvedDescription} />
      )}
      <meta key="og:type" property="og:type" content={type} />
      <meta key="og:locale" property="og:locale" content="en_PK" />
      {canonical && <meta key="og:url" property="og:url" content={canonical} />}

      {primaryUrl && <meta key="og:image" property="og:image" content={primaryUrl} />}
      {primaryUrl && (
        <meta key="og:image:secure_url" property="og:image:secure_url" content={primaryUrl} />
      )}
      {primaryUrl && <meta key="og:image:alt" property="og:image:alt" content={primaryAlt} />}
      {primaryUrl && primary?.mime && (
        <meta key="og:image:type" property="og:image:type" content={primary.mime} />
      )}
      {primaryUrl && primary?.width ? (
        <meta key="og:image:width" property="og:image:width" content={String(primary.width)} />
      ) : null}
      {primaryUrl && primary?.height ? (
        <meta key="og:image:height" property="og:image:height" content={String(primary.height)} />
      ) : null}

      {extraImages.map((img) => (
        <meta
          key={`og:image:${img.absoluteUrl}`}
          property="og:image"
          content={img.absoluteUrl as string}
        />
      ))}

      {/* Product facts. WhatsApp and Facebook surface these under the title, so
          a shared product shows its price without the shopper opening it. */}
      {isProduct && priceText && (
        <meta key="product:price:amount" property="product:price:amount" content={priceText} />
      )}
      {isProduct && priceText && (
        <meta key="product:price:currency" property="product:price:currency" content={currency} />
      )}
      {isProduct && priceText && (
        <meta key="og:price:amount" property="og:price:amount" content={priceText} />
      )}
      {isProduct && priceText && (
        <meta key="og:price:currency" property="og:price:currency" content={currency} />
      )}
      {isProduct && product?.availability && (
        <meta
          key="product:availability"
          property="product:availability"
          content={product.availability}
        />
      )}
      {isProduct && product?.brand && (
        <meta key="product:brand" property="product:brand" content={product.brand} />
      )}
      {isProduct && product?.sku && (
        <meta
          key="product:retailer_item_id"
          property="product:retailer_item_id"
          content={product.sku}
        />
      )}
      {isProduct && (
        <meta
          key="product:condition"
          property="product:condition"
          content={product?.condition || "new"}
        />
      )}

      {/* Twitter */}
      <meta
        key="twitter:card"
        name="twitter:card"
        content={primaryUrl ? "summary_large_image" : "summary"}
      />
      {settings.twitter_handle && (
        <meta key="twitter:site" name="twitter:site" content={settings.twitter_handle} />
      )}
      <meta key="twitter:title" name="twitter:title" content={socialTitle} />
      {resolvedDescription && (
        <meta key="twitter:description" name="twitter:description" content={resolvedDescription} />
      )}
      {primaryUrl && <meta key="twitter:image" name="twitter:image" content={primaryUrl} />}
      {primaryUrl && (
        <meta key="twitter:image:alt" name="twitter:image:alt" content={primaryAlt} />
      )}
      {/* Twitter renders these as a two-column strip beneath the image. */}
      {isProduct && priceText && (
        <meta key="twitter:label1" name="twitter:label1" content="Price" />
      )}
      {isProduct && priceText && (
        <meta key="twitter:data1" name="twitter:data1" content={`${currency} ${priceText}`} />
      )}
      {isProduct && product?.availability && (
        <meta key="twitter:label2" name="twitter:label2" content="Availability" />
      )}
      {isProduct && product?.availability && (
        <meta
          key="twitter:data2"
          name="twitter:data2"
          content={product.availability === "instock" ? "In stock" : "Currently unavailable"}
        />
      )}

      {children}
    </Head>
  );
}
