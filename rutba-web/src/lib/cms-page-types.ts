import { CmsPageInterface } from "@/types/api/cms-page";

export const PAGE_TYPES = ["shop", "blog", "news", "info"] as const;
export type PageType = (typeof PAGE_TYPES)[number];

export const PAGE_TYPE_LABELS: Record<PageType, string> = {
  shop: "Shop",
  blog: "Blog",
  news: "News",
  info: "Info",
};

export const PAGE_TYPE_ICONS: Record<PageType, string> = {
  shop: "🛍️",
  blog: "✍️",
  news: "📰",
  info: "ℹ️",
};

export function isValidPageType(value: string): value is PageType {
  return PAGE_TYPES.includes(value as PageType);
}

export function getPageUrl(page: Pick<CmsPageInterface, "page_type" | "slug">) {
  const type = page.page_type || "info";
  return `/${type}/${page.slug}`;
}
