import "@/styles/globals.scss";
import type { AppProps } from "next/app";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "@/components/ui/toaster";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Head from "next/head";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { IMAGE_URL } from "@/static/const";
// import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

const queryClient = new QueryClient();

function SiteHead() {
  const settings = useSiteSettings();
  const title = `${settings.site_name} - ${settings.site_tagline || ""}`.trim();
  const description = settings.site_description || "";
  const faviconUrl = settings.favicon?.url ? IMAGE_URL + settings.favicon.url : "/favicon.png";

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
