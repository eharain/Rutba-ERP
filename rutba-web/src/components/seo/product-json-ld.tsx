import Head from "next/head";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { resolveMediaUrl } from "@/lib/media-url";

interface ProductJsonLdProps {
  name: string;
  description?: string;
  slug: string;
  images?: { url: string }[];
  brand?: string;
  category?: string;
  sku?: string;
  price?: number;
  offerPrice?: number;
  currency?: string;
  inStock?: boolean;
}

/**
 * Product JSON-LD per schema.org/Product. Crawlers (Google Search, etc.) use
 * this for rich-result eligibility — price, availability, brand will surface
 * directly in search listings when populated.
 */
export default function ProductJsonLd({
  name,
  description,
  slug,
  images = [],
  brand,
  category,
  sku,
  price,
  offerPrice,
  currency = "PKR",
  inStock = true,
}: ProductJsonLdProps) {
  const settings = useSiteSettings();
  const siteUrl = (settings.site_url || "").replace(/\/$/, "");
  if (!name) return null;

  const url = siteUrl ? `${siteUrl}/product/${slug}` : undefined;

  const imgUrls = images
    .map((i) => resolveMediaUrl(i.url))
    .filter(Boolean)
    .map((u) =>
      siteUrl && u && !/^https?:\/\//i.test(u) ? `${siteUrl}${u}` : u
    );

  const finalPrice = offerPrice && offerPrice > 0 ? offerPrice : price;

  const payload = {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    ...(description ? { description: description.replace(/<[^>]+>/g, " ").slice(0, 500) } : {}),
    ...(imgUrls.length ? { image: imgUrls } : {}),
    ...(brand ? { brand: { "@type": "Brand", name: brand } } : {}),
    ...(category ? { category } : {}),
    ...(sku ? { sku } : {}),
    ...(url ? { url } : {}),
    ...(finalPrice && finalPrice > 0
      ? {
          offers: {
            "@type": "Offer",
            price: finalPrice,
            priceCurrency: currency,
            availability: inStock
              ? "https://schema.org/InStock"
              : "https://schema.org/OutOfStock",
            ...(url ? { url } : {}),
          },
        }
      : {}),
  };

  return (
    <Head>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(payload) }}
      />
    </Head>
  );
}
