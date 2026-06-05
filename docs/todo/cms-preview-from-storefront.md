# CMS preview — view draft pages on rutba-web before publishing

## Goal
From the CMS editor, click "Preview" on a CMS page / product / product-group and
see exactly how it'll look on rutba-web — including the draft content, not the
last published version. No iframes inside CMS; open a real storefront URL in a
new tab so editors can interact with the full layout (sticky header, scroll,
hover, mobile menu).

## Why it's tricky

1. **Anonymous storefront vs. authenticated editor.** The storefront uses the
   public `api` client (no JWT — see api/web/ descriptors generate public-`api` clients).
   Preview needs a controlled, time-bound elevation that doesn't leak to
   random visitors.

2. **Caching.** Production storefront serves with SSG / SSR cached responses.
   Preview must `Cache-Control: no-store` and bypass any CDN/edge cache —
   otherwise editors see stale content forever.

3. **SSR data + client refetch must agree.** Home page uses
   `getServerSideProps` + `useQuery({ initialData })`. If SSR returns draft
   data but the client refetch hits the published endpoint, the page will
   flash from draft → published. Both legs must take the same path.

4. **Strapi draft fetch shape.** Strapi 5 takes `status: 'draft'` in query
   params — but only callers with `find` permission on the draft scope get
   draft rows. Public `cms-pages` permission is published-only. We'll need
   either a per-request token Strapi recognises, or a separate preview
   endpoint with its own RBAC.

5. **Generalising across content types.** CMS page, product, product-group,
   sale-offer — each has its own detail route. The preview machinery should
   not be N copies.

## Design sketch

### Token + route

Editor in rutba-cms clicks "Preview" → CMS hits a Strapi endpoint
`POST /cms-pages/:documentId/preview-token` (or similar per content type)
that mints a short-lived signed token. CMS opens
`https://<site>/<page-url>?preview=<token>` in a new tab.

Token payload: `{ contentType, documentId, exp: now+15min, iss: 'rutba-cms' }`,
HMAC-signed with `PREVIEW_SECRET` shared between Strapi and rutba-web.

### Storefront resolver

A single `resolvePreview(ctx)` helper in rutba-web that:
- reads `?preview=` from the query
- verifies the signature server-side
- if valid, sets `ctx.res.setHeader('Cache-Control', 'no-store')`
- returns `{ isPreview: true, contentType, documentId }` to
  `getServerSideProps`

`getServerSideProps` for each detail route checks `isPreview` and:
- swaps the fetch to a draft-mode variant (`bySlugDraft` / `byDocumentIdDraft`)
- passes a flag down so client-side `useQuery` keys differently and uses
  the draft endpoint too

### API descriptors

Add draft variants in `api/web/`:

```js
// api/web/cms-pages.js
bySlugPreview: (slug, token) => ({
  path: '/cms-pages',
  method: 'get',
  params: {
    filters: { slug: { $eq: slug } },
    status: 'draft',
    fields: CMS_DETAIL_FIELDS,
    populate,
  },
  headers: { 'X-Preview-Token': token },
}),
```

The descriptor's `headers` field (new — not currently supported by the
scaffolder) lets Strapi's preview middleware authorise the request without
needing a user JWT. Add `headers:` parsing to the scaffolder when this lands.

### Strapi preview middleware

A small Strapi middleware that:
- looks for `X-Preview-Token`
- verifies the HMAC
- if valid and not expired and the token's `documentId` matches the request,
  injects an admin-equivalent permission scope **only for that one query**
- everything else stays anonymous

### CMS UI

Editor pages get a "Preview" button next to "Save Draft" / "Publish".
The mint-token + open-tab flow lives in a shared helper so each editor
(cms-page, product, product-group, sale-offer) gets it for one line of code.

## Edge cases

- **Token leaks**: tokens are short-lived (15 min) and bound to a single
  documentId. Even if shared, leakage is bounded in scope and time.
- **Logged-in user on storefront in another tab**: preview must not contaminate
  the normal session. Resolver only acts on the `?preview=` query, never on
  cookies.
- **CDN / proxy**: hard-coded `Cache-Control: no-store` on the SSR response.
  Document the CDN config when we ship.
- **Search engines crawling preview links**: `<meta name="robots" content="noindex,nofollow">`
  forced on when `isPreview === true` (`<Seo noindex />` covers this).
- **Refresh after token expires**: redirect to `/<page-url>` without the
  preview param + show a small toast "Preview expired — showing published".

## Effort estimate

- Strapi: middleware + token mint endpoint per content type (or one generic) — half-day.
- api-provider: descriptor `headers` support in scaffolder + per-type draft descriptors — half-day.
- Storefront: `resolvePreview` helper + plumb through each detail route — half-day.
- CMS: shared "Preview" button helper, wire into 4 editors — couple hours.
- QA: matrix of (logged in / not) × (preview / not) × (token valid / expired / forged) — half-day.

Plan on ~2 days of focused work. Worth it once content velocity picks up;
right now the publish-then-fix cycle works but won't scale to multiple editors.

## Related

- api/web/ descriptors generate public-`api` clients — the public-client convention preview must not subvert.
- pos-strapi integration contracts — preview tokens are a new "load-bearing header" that belongs in that contract.
