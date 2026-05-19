// Canonical product URL builder for the storefront.
//
// Product detail routes by slug (the editor-controlled URL key). When a
// caller still has a documentId-only object — typically pre-slug entries in
// recently-viewed/cart stores, or older CMS sections that haven't been
// repopulated — we fall back to documentId so the link still resolves
// (the server's findPublicDetail also accepts documentId for that reason).
export function productHref(
  product: { slug?: string | null; documentId?: string | null } | null | undefined,
  opts: { groupId?: string | null; offerId?: string | null } = {}
): string | null {
  if (!product) return null;
  const key = product.slug || product.documentId;
  if (!key) return null;
  const base = `/product/${encodeURIComponent(key)}`;
  if (!opts.groupId) return base;
  const qs = new URLSearchParams();
  qs.set("groupId", opts.groupId);
  if (opts.offerId) qs.set("offerId", opts.offerId);
  return `${base}?${qs.toString()}`;
}
