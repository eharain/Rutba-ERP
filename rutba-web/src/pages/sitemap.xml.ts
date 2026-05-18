import { GetServerSideProps } from "next";
import { getCmsPagesSSR } from "@/services";
import { WebProductsEndpoints } from "@/services/endpoints";
import { createWebSiteSettingsService } from "@/services";
import { getPageUrl } from "@/lib/cms-page-types";
import { CmsPageInterface } from "@/types/api/cms-page";
import { BASE_URL } from "@/static/const";

interface SitemapEntry {
  loc: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number;
}

const STATIC_ROUTES: SitemapEntry[] = [
  { loc: "/", changefreq: "daily", priority: 1.0 },
  { loc: "/shop", changefreq: "daily", priority: 0.9 },
  { loc: "/product", changefreq: "daily", priority: 0.9 },
  { loc: "/blog", changefreq: "weekly", priority: 0.6 },
];

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function renderSitemap(entries: SitemapEntry[], baseUrl: string) {
  const url = (e: SitemapEntry) => {
    const abs = e.loc.startsWith("http") ? e.loc : `${baseUrl}${e.loc}`;
    return [
      "  <url>",
      `    <loc>${escapeXml(abs)}</loc>`,
      e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : "",
      e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : "",
      e.priority != null ? `    <priority>${e.priority.toFixed(1)}</priority>` : "",
      "  </url>",
    ]
      .filter(Boolean)
      .join("\n");
  };

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map(url),
    "</urlset>",
  ].join("\n");
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  // Resolve site_url at request time so editors can change it via CMS.
  const settings = await createWebSiteSettingsService({ baseURL: BASE_URL })
    .getSiteSettings()
    .catch(() => null);

  const baseUrl =
    (settings?.site_url || "").replace(/\/$/, "") || "";

  const entries: SitemapEntry[] = [...STATIC_ROUTES];

  // CMS pages — exclude noindex and skip "shop" page_type (those are listed
  // via /shop/* below; their page-level URL still works but the CMS slug is
  // the canonical entry).
  try {
    const cmsPages = (await getCmsPagesSSR()) as CmsPageInterface[];
    for (const p of cmsPages) {
      if (p.seo_meta?.noindex) continue;
      entries.push({
        loc: getPageUrl(p),
        lastmod: p.updatedAt?.split("T")[0],
        changefreq: "weekly",
        priority: 0.7,
      });
    }
  } catch (err) {
    console.warn("sitemap: failed to load cms pages", err);
  }

  // Products — paginate; cap so a runaway catalog doesn't make a giant file.
  // For >5k products move to a sitemap index.
  try {
    const list = await WebProductsEndpoints.list({}, "1");
    const products = (list?.data ?? []) as Array<{ documentId: string; updatedAt?: string }>;
    for (const p of products.slice(0, 5000)) {
      entries.push({
        loc: `/product/${p.documentId}`,
        lastmod: p.updatedAt?.split("T")[0],
        changefreq: "weekly",
        priority: 0.8,
      });
    }
  } catch (err) {
    console.warn("sitemap: failed to load products", err);
  }

  const xml = renderSitemap(entries, baseUrl);

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=3600, stale-while-revalidate=86400"
  );
  res.write(xml);
  res.end();

  return { props: {} };
};

// Page component is never rendered — getServerSideProps writes directly.
export default function Sitemap() {
  return null;
}
