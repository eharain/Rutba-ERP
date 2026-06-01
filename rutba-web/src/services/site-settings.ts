// Bypass the './endpoints' barrel — it re-exports the entire api-provider
// web tree (cart, checkout, orders, …). This file is pulled in by every
// route via the <Seo /> component in _app.tsx, so loading the barrel here
// inflates the cold-compile dep cone for the whole app. Pin to the single
// generated endpoint module. (The package's "./endpoints/*" exports field
// maps this path to providers/generated/client/web/site-settings.js.)
import { WebSiteSettingsEndpoints } from '@rutba/api-provider/endpoints/web/site-settings.js';

export const SITE_SETTINGS_DEFAULTS = {
    id: 0,
    site_name: 'Rutba.pk',
    site_tagline: 'Premium Products at Exceptional Prices',
    site_description: 'Your ultimate destination for premium products at exceptional prices',
    site_logo: { url: "/rutba_erp_logo.png" },
    favicon: { url: "/favicon.ico" },
    header_promo_enabled: false,
    header_promo_text: '',
    header_promo_cta_text: '',
    header_promo_cta_url: '',
    nav_explore_products_label: 'Explore Products',
    nav_explore_brands_label: 'Explore Brands',
    nav_login_label: 'Login or Register',
    nav_search_placeholder: 'Search Products',
    // SEO defaults — overridden per-page when a CMS page provides its own values
    site_url: '',
    default_meta_title: '',
    default_meta_description: '',
    default_meta_keywords: '',
    default_og_image: null as { url: string } | null,
    twitter_handle: '',
    // Fallback CMS footer — used when a page doesn't carry its own footer
    // relation. Carries tracking codes (GA / Meta Pixel / GTM / custom HTML)
    // so site-wide analytics work without configuring each page individually.
    default_footer: null as import('@/types/api/cms-page').CmsFooterInterface | null,
};

export type SiteSettings = typeof SITE_SETTINGS_DEFAULTS;

export async function fetchSiteSettings(): Promise<SiteSettings> {
    try {
        const res = await WebSiteSettingsEndpoints.get();
        const data = res?.data;
        if (!data) return SITE_SETTINGS_DEFAULTS;
        return { ...SITE_SETTINGS_DEFAULTS, ...data };
    } catch {
        return SITE_SETTINGS_DEFAULTS;
    }
}

export function createWebSiteSettingsService(config = {}) {
    void config;
    return { endpoints: WebSiteSettingsEndpoints, getSiteSettings: fetchSiteSettings };
}
