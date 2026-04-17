import axios from "axios";
import { BASE_URL, IMAGE_URL } from "@/static/const";

export interface SiteSettingsInterface {
  id: number;
  site_name: string;
  site_tagline?: string;
  site_description?: string;
  site_logo?: { url: string } | null;
  favicon?: { url: string } | null;
  header_promo_enabled?: boolean;
  header_promo_text?: string;
  header_promo_cta_text?: string;
  header_promo_cta_url?: string;
  nav_explore_products_label?: string;
  nav_explore_brands_label?: string;
  nav_login_label?: string;
  nav_search_placeholder?: string;
}

const DEFAULTS: SiteSettingsInterface = {
  id: 0,
  site_name: "Rutba.pk",
  site_tagline: "Premium Products at Exceptional Prices",
  site_description: "Your ultimate destination for premium products at exceptional prices",
  site_logo: null,
  favicon: null,
  header_promo_enabled: false,
  header_promo_text: "",
  header_promo_cta_text: "",
  header_promo_cta_url: "",
  nav_explore_products_label: "Explore Products",
  nav_explore_brands_label: "Explore Brands",
  nav_login_label: "Login or Register",
  nav_search_placeholder: "Search Products",
};

export async function getSiteSettings(): Promise<SiteSettingsInterface> {
  try {
    const res = await axios.get(BASE_URL + "site-setting", {
      params: {
        populate: ["site_logo", "favicon"],
      },
    });
    const data = res.data?.data;
    if (!data) return DEFAULTS;
    return { ...DEFAULTS, ...data };
  } catch {
    return DEFAULTS;
  }
}

export { DEFAULTS as SITE_SETTINGS_DEFAULTS };
