import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import CodeLanding from "@/components/qr/code-landing";
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
 *
 * Short links live at `/s/<code>` and share this route's resolver and its
 * ambiguous/dead-end UI; only the ranking of a Base32 product id differs.
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

export default function QrLandingRoute(
  props: InferGetServerSidePropsType<typeof getServerSideProps>,
) {
  return <CodeLanding {...props} />;
}
