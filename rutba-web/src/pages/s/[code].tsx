import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import CodeLanding from "@/components/qr/code-landing";
import { QrMatch, resolveQrCodeSSR } from "@/services/qr";

/**
 * Short product links — `<storefront>/s/<base32(product.id)>`.
 *
 * `/product/<slug>` is the canonical URL and stays that way; this exists for
 * the two places a slug is a liability. In a social caption the URL competes
 * with the copy for attention and eats characters that could be selling the
 * product. On the phone, "rutba dot pk slash s slash three eff kay" is
 * something a customer can actually write down. The code is Crockford Base32
 * of `product.id`, whose alphabet has no confusable pairs and which folds
 * O→0 and I/L→1 on the way back in, so a mis-transcription still lands.
 *
 * The redirect is deliberately temporary. Slugs are editable, so a 301 would
 * have caches pinning a short link to a URL the product may have moved off;
 * the id behind the code is what is permanent, not the slug it resolves to
 * today.
 *
 * Resolution is the same server call `/qr/<code>` makes, with `prefer='short'`
 * so a decoded id outranks a slug that happens to be valid Base32 ("sale"
 * decodes to 829486). That also means a `/s/` link that *isn't* a short code
 * still resolves as a slug, and an ambiguous or dead code gets the same
 * chooser and 404/503 handling as a scanned QR rather than a bare error.
 */
/**
 * Carry the caller's query string onto the redirect.
 *
 * A short link is what gets pasted into a campaign, so it is also what picks up
 * `?utm_source=…`. Dropping those on the redirect would make every short link
 * report as direct traffic and quietly ruin attribution for the exact posts
 * this route exists to serve. `code` is the route param, not a real query
 * value, so it never travels.
 */
function forwardedQuery(query: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key === "code" || value == null) continue;
    for (const v of Array.isArray(value) ? value : [value]) params.append(key, v);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export const getServerSideProps: GetServerSideProps<{
  code: string;
  matches: QrMatch[];
  failed: boolean;
}> = async (context) => {
  const code = String(context.params?.code ?? "");

  let matches: QrMatch[] = [];
  let failed = false;
  try {
    matches = await resolveQrCodeSSR(code, "short");
  } catch (err) {
    // A short link is printed on posts we do not control and cannot edit once
    // shared. Never answer an outage with 404 — that tells every crawler the
    // link is dead and bakes it into caches. 503 asks them to come back.
    failed = true;
    console.error(`[short-link] resolve failed for ${code}`, err);
  }

  if (matches.length === 1) {
    const destination = `${matches[0].path}${forwardedQuery(context.query)}`;
    return { redirect: { destination, permanent: false } };
  }

  if (failed) context.res.statusCode = 503;
  else if (matches.length === 0) context.res.statusCode = 404;

  return { props: { code, matches, failed } };
};

export default function ShortLinkRoute(
  props: InferGetServerSidePropsType<typeof getServerSideProps>,
) {
  return <CodeLanding {...props} />;
}
