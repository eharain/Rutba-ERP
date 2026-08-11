// Universal QR resolution. Printed material encodes `<storefront>/qr/<code>`;
// the landing route hands the code straight to the server, which searches
// products, product-groups, CMS pages and CMS page-groups and returns every
// published match. See pos-strapi/src/api/qr/services/qr.js.
//
// The storefront's short links (`<storefront>/s/<base32(product.id)>`) resolve
// through the same endpoint with `prefer='short'`, so they inherit its
// disambiguation and outage handling. The flag only reorders matches: under
// `/s/` a decoded product id wins outright, under `/qr/` it is a last resort,
// because most short slugs are also valid Base32 and a printed slug must not
// lose to an accidental decode.
export const WebQrEndpoints = {
  resolve: (code, prefer) => ({
    path: `/qr/resolve/${encodeURIComponent(code)}`,
    method: 'get',
    params: prefer ? { prefer } : {},
  }),
};
