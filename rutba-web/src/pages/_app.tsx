import "@/styles/globals.scss";
import type { AppProps } from "next/app";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "@/components/ui/toaster";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppContextEndpoints } from "@rutba/api-provider/endpoints";
import Seo from "@/components/seo/seo";
import SiteJsonLd from "@/components/seo/site-json-ld";

// Tag every request from rutba-web with X-Rutba-App so the strapi-api-pro
// claim middleware can pick the correct policy. The storefront acts in the
// 'web' domain; anonymous calls resolve to the web_public role, signed-in
// calls to web_user (server-side fallback or explicit X-Rutba-App-Role).
AppContextEndpoints.setAppName('web');

const queryClient = new QueryClient();

export default function App({
  Component,
  pageProps: { session, ...pageProps },
}: AppProps) {
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
