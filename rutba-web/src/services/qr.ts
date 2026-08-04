import { WebQrEndpoints } from '@rutba/api-provider/endpoints/web/qr.js';

export type QrMatchKind =
  | 'product'
  | 'product-group'
  | 'cms-page'
  | 'cms-page-group';

export interface QrMatch {
  kind: QrMatchKind;
  /** Human label for the kind ("Product", "Collection", …), supplied by the server. */
  label: string;
  documentId: string;
  slug: string | null;
  title: string;
  subtitle: string | null;
  image: string | null;
  /** Host-relative storefront path this match points at. */
  path: string;
  matched_on: 'qr_code' | 'slug' | 'documentId';
}

/**
 * The shared webApi transport sets no request timeout, so a wedged backend
 * leaves an SSR page hanging until the browser gives up. That is tolerable on
 * a page someone navigated to; it is not on a QR landing page, where the
 * visitor is standing in front of the product holding their phone. Bound the
 * wait and let the route render a "try again" instead of a spinner.
 *
 * The underlying request is not cancellable through webApi — this only stops
 * us waiting on it.
 */
const RESOLVE_TIMEOUT_MS = 8000;

export class QrResolveTimeout extends Error {
  constructor() {
    super(`QR resolve exceeded ${RESOLVE_TIMEOUT_MS}ms`);
    this.name = "QrResolveTimeout";
  }
}

/**
 * Resolve a scanned QR token. The server searches every content type a printed
 * code can refer to, so a code that matches nothing here really is unknown —
 * there is no second lookup worth trying.
 */
export async function resolveQrCodeSSR(code: string): Promise<QrMatch[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const res = await Promise.race([
      WebQrEndpoints.resolve(code),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new QrResolveTimeout()), RESOLVE_TIMEOUT_MS);
      }),
    ]);
    return ((res as { data?: { matches?: QrMatch[] } })?.data?.matches ?? []) as QrMatch[];
  } finally {
    if (timer) clearTimeout(timer);
  }
}
