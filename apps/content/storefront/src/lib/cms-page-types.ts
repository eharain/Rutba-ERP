import { CmsPageInterface } from "@/types/api/cms-page";

export const PAGE_TYPES = ["shop", "blog", "news", "info", "page"] as const;
export type PageType = (typeof PAGE_TYPES)[number];

export const PAGE_TYPE_LABELS: Record<PageType, string> = {
  shop: "Shop",
  blog: "Blog",
  news: "News",
  info: "Info",
  page: "Page",
};

export const PAGE_TYPE_ICONS: Record<PageType, string> = {
  shop: "🛍️",
  blog: "✍️",
  news: "📰",
  info: "ℹ️",
  page: "📄",
};

export function isValidPageType(value: string): value is PageType {
  return PAGE_TYPES.includes(value as PageType);
}

export function getPageUrl(page: Pick<CmsPageInterface, "page_type" | "slug">) {
  const type = page.page_type || "info";
  return `/${type}/${page.slug}`;
}

/**
 * Page types that have a public list route on rutba-web (i.e. a
 * `pages/<type>/index.tsx`). "page" deliberately omitted — pages of that
 * type are linked directly via their slug; there's no aggregate list view.
 */
export const PAGE_TYPES_WITH_LIST: readonly PageType[] = [
  "shop",
  "blog",
  "news",
  "info",
] as const;

/**
 * Plural / nicer-to-read labels for the public list routes. Falls back to
 * the singular label when not overridden.
 */
export const PAGE_TYPE_LIST_LABELS: Partial<Record<PageType, string>> = {
  shop: "Shop",
  blog: "Blog",
  news: "News",
  info: "Help & Info",
};

export function getListUrlForType(type: PageType): string {
  return `/${type}`;
}
