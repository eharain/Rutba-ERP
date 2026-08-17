import Link from "next/link";
import { ArrowRight, Home, QrCode, ShoppingBag } from "lucide-react";
import LayoutMain from "@/components/layouts";
import Seo from "@/components/seo/seo";
import { Button } from "@/components/ui/button";
import { resolveMediaUrl } from "@/lib/media-url";
import { QrMatch } from "@/services/qr";

/**
 * What a visitor sees when a code did NOT resolve to exactly one destination.
 *
 * Shared by `/qr/<code>` (scanned off print material) and `/s/<code>` (a short
 * link read off a post or over the phone). The single-match case never reaches
 * here — both routes redirect from getServerSideProps so the scanner lands on
 * the real page without an intermediate paint. This is the ambiguous and
 * dead-end tail of both, and it is one component because a visitor holding a
 * product has no idea which namespace they arrived through, so the two must not
 * drift apart.
 */
export interface CodeLandingProps {
  code: string;
  matches: QrMatch[];
  /** Lookup failed (backend outage), as opposed to the code being unknown. */
  failed: boolean;
}

export default function CodeLanding({ code, matches, failed }: CodeLandingProps) {
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
