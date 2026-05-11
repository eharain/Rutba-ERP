import { IMAGE_URL } from "@/static/const";

export function resolveMediaUrl(url?: string | null) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/uploads/")) return `${IMAGE_URL}${url}`;
  return url;
}
