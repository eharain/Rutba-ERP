import { useQuery } from "@tanstack/react-query";
import { getSiteSettings, SiteSettingsInterface, SITE_SETTINGS_DEFAULTS } from "@/services/site-settings";

export function useSiteSettings(): SiteSettingsInterface {
  const { data } = useQuery({
    queryKey: ["site-settings"],
    queryFn: getSiteSettings,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  return data ?? SITE_SETTINGS_DEFAULTS;
}
