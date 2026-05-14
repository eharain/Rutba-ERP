import { useQuery } from "@tanstack/react-query";
// Direct path, not the @/services barrel — _app.tsx loads this hook on every
// route, and pulling the barrel here drags in the full api-provider tree
// (checkout, orders, cart, …) and explodes the cold-compile root for
// `pages/_app`. Keep this dep cone small.
import { createWebSiteSettingsService, SITE_SETTINGS_DEFAULTS } from "@/services/site-settings";
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
