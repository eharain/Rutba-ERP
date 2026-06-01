import "@/styles/globals.scss";
import { useState } from "react";
import App, { type AppContext, type AppProps } from "next/app";
import { SessionProvider } from "next-auth/react";
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
    const client = new QueryClient();
    client.setQueryData(SITE_SETTINGS_QUERY_KEY, siteSettings ?? SITE_SETTINGS_DEFAULTS);
    return client;
  });

  return (
    <SessionProvider session={session}>
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
