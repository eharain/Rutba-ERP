import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { shortLinkPath } from "@rutba/api-provider/lib/short-code.js";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { createWebProductsService } from "@/services";
import { resolveMediaUrl } from "@/lib/media-url";
import { BASE_URL } from "@/static/const";
import ShareDialog from "./share-dialog";

interface ProductShareProps {
  product: {
    id?: number;
    documentId?: string;
    slug?: string;
    name?: string;
    summary?: string;
    description?: string;
    logo?: { url?: string } | null;
    gallery?: { url?: string }[] | null;
  } | null | undefined;
  className?: string;
}

/** First sentence or two of the product's own copy — the fallback share text. */
function productBlurb(product: ProductShareProps["product"]): string {
  const raw = (product?.summary || product?.description || "").toString();
  const plain = raw
    .replace(/<[^>]+>/g, " ")
    .replace(/[#*_~`>[\]()!|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const name = product?.name ?? "";
  if (!plain) return name;
  return `${name}\n\n${plain.length > 220 ? `${plain.slice(0, 217)}…` : plain}`;
}

/**
 * Share button for a product page.
 *
 * Shares the short `/s/<code>` link rather than `/product/<slug>`: it is what
 * fits in a caption and what someone can repeat on the phone, and because the
 * redirect lands on the product page — whose `og:url` is the canonical — the
 * platforms that scrape still file the share under the real URL.
 *
 * The brand's own caption is fetched when the sheet OPENS, not when a share
 * button is clicked. Doing it on the click would spend the user gesture on a
 * network round trip, and Safari rejects navigator.share() once the gesture is
 * no longer fresh.
 */
export default function ProductShare({ product, className }: ProductShareProps) {
  const settings = useSiteSettings();
  const [opened, setOpened] = useState(false);
  const productsService = createWebProductsService({ baseURL: BASE_URL });

  const key = product?.slug || product?.documentId || "";

  const { data: shareText, isLoading } = useQuery({
    queryKey: ["product-share", key],
    queryFn: () => productsService.getProductShare(key),
    // Only after the sheet is open — this is the whole reason the caption is
    // not part of the detail payload.
    enabled: opened && !!key,
    staleTime: 5 * 60_000,
  });

  if (!product?.name || !key) return null;

  const siteUrl = (settings.site_url || "").replace(/\/$/, "");
  // The short link needs the numeric id; without it (a projection that dropped
  // `id`) fall back to the canonical product URL rather than a broken /s/.
  const path =
    typeof product.id === "number"
      ? shortLinkPath(product.id)
      : `/product/${encodeURIComponent(key)}`;
  const url = siteUrl ? `${siteUrl}${path}` : path;

  const rawImage = product.gallery?.[0]?.url || product.logo?.url || null;
  const resolved = rawImage ? resolveMediaUrl(rawImage) : null;
  const image =
    resolved && siteUrl && !/^https?:\/\//i.test(resolved) ? `${siteUrl}${resolved}` : resolved;

  return (
    <ShareDialog
      url={url}
      title={product.name}
      text={shareText?.caption || productBlurb(product)}
      image={image}
      loadingText={opened && isLoading}
      captionSource={shareText?.caption ? "social-post" : "product"}
      onOpenChange={(next) => {
        if (next) setOpened(true);
      }}
      className={className}
    />
  );
}
