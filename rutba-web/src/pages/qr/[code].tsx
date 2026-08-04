import Link from "next/link";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { ArrowRight, Home, QrCode, ShoppingBag } from "lucide-react";
import LayoutMain from "@/components/layouts";
import Seo from "@/components/seo/seo";
import { Button } from "@/components/ui/button";
import { resolveMediaUrl } from "@/lib/media-url";
import { QrMatch, resolveQrCodeSSR } from "@/services/qr";

/**
 * Landing route for every printed QR code.
 *
 * Labels, packaging and print material all encode `<storefront>/qr/<code>`
 * rather than a direct product/page URL, so a code outlives whatever it points
 * at today. The server resolves the code against products, collections, CMS
 * pages and page-groups at scan time:
 *
 *   1 match  → redirect straight through (temporary; the target can change)
 *   n matches → let the visitor pick
 *   0 matches → a dead-end page with a 404 status
 *
 * Resolution happens in getServerSideProps so the single-match case never
 * paints an intermediate screen — the scanner lands on the real page.
 */
export const getServerSideProps: GetServerSideProps<{
  code: string;
  matches: QrMatch[];
  failed: boolean;
}> = async (context) => {
  const code = String(context.params?.code ?? "");

  let matches: QrMatch[] = [];
  let failed = false;
  try {
    matches = await resolveQrCodeSSR(code);
  } catch (err) {
    // An outage is NOT an unknown code. Saying "this doesn't exist" to someone
    // holding the physical product tells them the item was discontinued, and
    // 404 invites caches and crawlers to agree. 503 says "ask again later".
    failed = true;
    console.error(`[qr] resolve failed for ${code}`, err);
  }

  if (matches.length === 1) {
    return { redirect: { destination: matches[0].path, permanent: false } };
  }

  if (failed) context.res.statusCode = 503;
  else if (matches.length === 0) context.res.statusCode = 404;

  return { props: { code, matches, failed } };
};

export default function QrLandingRoute({
  code,
  matches,
  failed,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  if (!matches.length) {
    return (
      <LayoutMain>
        <>
          <Seo title={failed ? "Something went wrong" : "Code not recognised"} noindex />
          <section className="container-fluid py-24 md:py-32">
            <div className="max-w-2xl mx-auto text-center">
              <p className="eyebrow mb-3">{failed ? "Temporary problem" : "Unknown code"}</p>
              <h1 className="font-display text-5xl md:text-7xl font-bold tracking-tight leading-none">
                {failed ? "We couldn't check that code" : "Nothing behind this one"}
              </h1>
              <p className="mt-6 text-lg text-muted-foreground max-w-md mx-auto">
                {failed ? (
                  <>
                    Something went wrong looking up{" "}
                    <span className="font-mono text-foreground">{code}</span>.
                    This is on us, not the code — please try again in a moment.
                  </>
                ) : (
                  <>
                    We couldn&apos;t find anything for{" "}
                    <span className="font-mono text-foreground">{code}</span>. The
                    item may have been removed, or the code may be from an older
                    print run.
                  </>
                )}
              </p>

              <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                <Button asChild size="lg" className="rounded-full h-12 px-6 group">
                  <Link href="/">
                    <Home className="h-4 w-4 mr-2" />
                    Back to home
                    <ArrowRight className="h-4 w-4 ml-2 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="rounded-full h-12 px-6"
                >
                  <Link href="/product">
                    <ShoppingBag className="h-4 w-4 mr-2" />
                    Browse products
                  </Link>
                </Button>
              </div>
            </div>
          </section>
        </>
      </LayoutMain>
    );
  }

  return (
    <LayoutMain>
      <>
        <Seo title="Choose a destination" noindex />
        <section className="container-fluid py-16 md:py-24">
          <div className="max-w-2xl mx-auto">
            <p className="eyebrow mb-3 flex items-center gap-2">
              <QrCode className="h-4 w-4" />
              Scanned <span className="font-mono">{code}</span>
            </p>
            <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight leading-tight">
              More than one match
            </h1>
            <p className="mt-4 text-muted-foreground">
              This code points at {matches.length} things. Pick the one you
              were after.
            </p>

            <ul className="mt-10 space-y-3">
              {matches.map((match) => (
                <li key={`${match.kind}:${match.documentId}`}>
                  <Link
                    href={match.path}
                    className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-4 hover:border-foreground/40 transition-colors"
                  >
                    <span className="shrink-0 h-16 w-16 rounded-xl overflow-hidden bg-secondary flex items-center justify-center">
                      {match.image ? (
                        <img
                          src={resolveMediaUrl(match.image)}
                          alt={match.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <QrCode className="h-5 w-5 text-muted-foreground" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="eyebrow block text-xs">
                        {match.label}
                      </span>
                      <span className="block font-medium truncate group-hover:text-brand transition-colors">
                        {match.title}
                      </span>
                      {match.subtitle && (
                        <span className="block text-sm text-muted-foreground truncate">
                          {match.subtitle}
                        </span>
                      )}
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </>
    </LayoutMain>
  );
}
