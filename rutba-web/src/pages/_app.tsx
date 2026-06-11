import "@/styles/globals.scss";
import { useEffect, useState } from "react";
import App, { type AppContext, type AppProps } from "next/app";
import { SessionProvider, signOut, useSession } from "next-auth/react";
import { Toaster } from "@/components/ui/toaster";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppContextEndpoints } from "@rutba/api-provider/endpoints";
import Seo from "@/components/seo/seo";
import SiteJsonLd from "@/components/seo/site-json-ld";
import {
  fetchSiteSettings,
  SITE_SETTINGS_DEFAULTS,
  type SiteSettings,
} from "@/services/site-settings";
import { SITE_SETTINGS_QUERY_KEY } from "@/hooks/use-site-settings";

// Tag every request from rutba-web with X-Rutba-App so the strapi-api-pro
// claim middleware can pick the correct policy. The storefront acts in the
// 'web' domain; anonymous calls resolve to the web_public role, signed-in
// calls to web_user (server-side fallback or explicit X-Rutba-App-Role).
AppContextEndpoints.setAppName('web');

type RutbaAppProps = AppProps & { siteSettings?: SiteSettings };

// When the Strapi refresh token is dead (NextAuth marks the session with
// error: "SessionExpired"), drop to guest browsing quietly instead of letting
// every authenticated call 401 into error cards while the UI still says
// "logged in". No redirect — the shopper keeps whatever page they're on.
function SessionExpiryGuard() {
  const { data: session } = useSession();
  const expired = session?.error === "SessionExpired";
  useEffect(() => {
    if (expired) signOut({ redirect: false });
  }, [expired]);
  return null;
}

function RutbaApp({
  Component,
  pageProps: { session, ...pageProps },
  siteSettings,
}: RutbaAppProps) {
  // Per-render QueryClient — a module-level singleton is shared across
  // requests on the Node SSR process, so a cached entry from request A
  // leaks into request B's render and `initialData` from getServerSideProps
  // gets ignored. That mismatch then trips hydration on the client.
  // Seed site-settings into the cache so the very first render (SSR + client
  // hydration) uses the configured logo/SEO instead of in-code defaults.
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          // Auto-retry transient failures (network blips, 5xx) a couple of
          // times before any ErrorCard is shown. Don't retry hard 4xx like
          // 404 — the resource genuinely isn't there, so retrying just delays
          // the (now friendly) error and burns requests.
          retry: (failureCount, error) => {
            const status = (error as { response?: { status?: number } })
              ?.response?.status;
            if (status && status >= 400 && status < 500) return false;
            return failureCount < 2;
          },
          retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
          refetchOnWindowFocus: false,
          // Storefront data changes slowly; serving the cache for a minute
          // avoids a refetch on every remount/navigation. Every skipped
          // request is one less chance for a flaky connection to flip a
          // rendered page into an error state.
          staleTime: 60_000,
        },
      },
    });
    client.setQueryData(SITE_SETTINGS_QUERY_KEY, siteSettings ?? SITE_SETTINGS_DEFAULTS);
    return client;
  });

  return (
    // refetchInterval keeps long-lived tabs hitting /api/auth/session, which
    // is where the NextAuth jwt callback rotates the 2h Strapi access token.
    // 30 min gives 3-4 renewal chances per token lifetime; focus refetch
    // (default on) covers tabs coming back from background.
    <SessionProvider session={session} refetchInterval={30 * 60}>
      <SessionExpiryGuard />
      <QueryClientProvider client={queryClient}>
        <Toaster />
        {/* Site-wide SEO defaults — pages override with their own <Seo />.
            Page-level <Head>/<Seo> tags win because next/head merges by
            attribute key (last write wins for <title>, <meta name=…>). */}
        <Seo />
        <SiteJsonLd />
        <Component {...pageProps} />
      </QueryClientProvider>
    </SessionProvider>
  );
}

// Server-side prefetch so SSR HTML carries the configured logo + SEO.
// Runs once per SSR request; on the client the prop comes back pre-baked
// via __NEXT_DATA__ and no extra fetch happens for site-settings.
RutbaApp.getInitialProps = async (appCtx: AppContext) => {
  const appProps = await App.getInitialProps(appCtx);
  if (typeof window !== "undefined") return appProps;
  const siteSettings = await fetchSiteSettings();
  return { ...appProps, siteSettings };
};

export default RutbaApp;
