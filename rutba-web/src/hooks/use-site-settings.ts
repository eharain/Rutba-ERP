import { useQuery } from "@tanstack/react-query";
import { createWebSiteSettingsService, SITE_SETTINGS_DEFAULTS } from "@rutba/api-provider/client/web";
import { BASE_URL } from "@/static/const";

const siteSettingsService = createWebSiteSettingsService({ baseURL: BASE_URL });

export function useSiteSettings() {
  const { data } = useQuery({
    queryKey: ["site-settings"],
    queryFn: () => siteSettingsService.getSiteSettings(),
    staleTime: Infinity,
    gcTime: Infinity,
  });

  return data ?? SITE_SETTINGS_DEFAULTS;
}
