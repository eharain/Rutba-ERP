import { useSiteSettings } from "@/hooks/use-site-settings";
import { resolveMediaUrl } from "@/lib/media-url";
import ShareDialog from "./share-dialog";

interface PageShareProps {
  /** Host-relative path of the page being shared, e.g. `/blog/my-post`. */
  path: string;
  title: string;
  /** Excerpt or summary — becomes the seeded share message. */
  summary?: string | null;
  image?: { url?: string } | string | null;
  className?: string;
}

/**
 * Share button for editorial and collection pages.
 *
 * Deliberately thinner than ProductShare: there is no social caption to fetch
 * because posts are linked to products, not to CMS pages, so the message is
 * seeded from the page's own excerpt and the shopper edits it if they care.
 * Everything that makes the resulting card look right — image, dimensions,
 * title — comes from the page's Open Graph block, not from here.
 */
export default function PageShare({
  path,
  title,
  summary,
  image,
  className,
}: PageShareProps) {
  const settings = useSiteSettings();
  if (!title || !path) return null;

  const siteUrl = (settings.site_url || "").replace(/\/$/, "");
  const url = siteUrl ? `${siteUrl}${path}` : path;

  const rawImage = typeof image === "string" ? image : image?.url;
  const resolved = rawImage ? resolveMediaUrl(rawImage) : null;
  const absoluteImage =
    resolved && siteUrl && !/^https?:\/\//i.test(resolved) ? `${siteUrl}${resolved}` : resolved;

  const blurb = (summary ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#*_~`>[\]()!|]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return (
    <ShareDialog
      url={url}
      title={title}
      text={blurb ? `${title}\n\n${blurb.length > 220 ? `${blurb.slice(0, 217)}…` : blurb}` : title}
      image={absoluteImage}
      className={className}
    />
  );
}
