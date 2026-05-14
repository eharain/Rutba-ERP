import "@/styles/globals.scss";
import type { AppProps } from "next/app";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "@/components/ui/toaster";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Head from "next/head";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { resolveMediaUrl } from "@/lib/media-url";
import { AppContextEndpoints } from "@rutba/api-provider/endpoints";
// import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

// Tag every request from rutba-web with X-Rutba-App so the strapi-api-pro
// claim middleware can pick the correct policy. The storefront acts in the
// 'web' domain; anonymous calls resolve to the web_public role, signed-in
// calls to web_user (server-side fallback or explicit X-Rutba-App-Role).
AppContextEndpoints.setAppName('web');

const queryClient = new QueryClient();

function SiteHead() {
  const settings = useSiteSettings();
  const title = `${settings.site_name} - ${settings.site_tagline || ""}`.trim();
  const description = settings.site_description || "";
  const faviconUrl = settings.favicon?.url ? resolveMediaUrl(settings.favicon.url) : "/favicon.png";

  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={`${settings.site_name} - ${description}`} />
      <link rel="shortcut icon" href={faviconUrl} type="image/x-icon" />
    </Head>
  );
}

export default function App({
  Component,
  pageProps: { session, ...pageProps },
}: AppProps) {
  return (
    <SessionProvider session={session}>
      <QueryClientProvider client={queryClient}>
        {/* <ReactQueryDevtools initialIsOpen={false} /> */}
        <Toaster />
        <SiteHead />
        <Component {...pageProps} />
      </QueryClientProvider>
    </SessionProvider>
  );
}
