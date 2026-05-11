import { WebSiteSettingsEndpoints } from './endpoints';

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
};

export function createWebSiteSettingsService(config = {}) {
    void config;
    const proxy = WebSiteSettingsEndpoints;

    const getSiteSettings = async () => {
        try {
            const res = await proxy.get();
            const data = res?.data;
            if (!data) return SITE_SETTINGS_DEFAULTS;
            return { ...SITE_SETTINGS_DEFAULTS, ...data };
        } catch {
            return SITE_SETTINGS_DEFAULTS;
        }
    };

    return { endpoints: proxy, getSiteSettings };
}

