import { useQuery } from "@tanstack/react-query";
// Direct path, not the @/services barrel — _app.tsx loads this hook on every
// route, and pulling the barrel here drags in the full api-provider tree
// (checkout, orders, cart, …) and explodes the cold-compile root for
// `pages/_app`. Keep this dep cone small.
import { fetchSiteSettings, SITE_SETTINGS_DEFAULTS } from "@/services/site-settings";

export const SITE_SETTINGS_QUERY_KEY = ["site-settings"] as const;

export function useSiteSettings() {
  const { data } = useQuery({
    queryKey: SITE_SETTINGS_QUERY_KEY,
    queryFn: fetchSiteSettings,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  return data ?? SITE_SETTINGS_DEFAULTS;
}
