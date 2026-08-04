// Universal QR resolution. Printed material encodes `<storefront>/qr/<code>`;
// the landing route hands the code straight to the server, which searches
// products, product-groups, CMS pages and CMS page-groups and returns every
// published match. See pos-strapi/src/api/qr/services/qr.js.
export const WebQrEndpoints = {
  resolve: (code) => ({
    path: `/qr/resolve/${encodeURIComponent(code)}`,
    method: 'get',
    params: {},
  }),
};
