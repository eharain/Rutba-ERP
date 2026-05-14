# Barcode QR deep-link (TODO)

## What

Print product/stock-item labels with a QR code that **encodes a URL pointing
at the storefront**, e.g. `https://shop.example.com/p/<sku>` or
`https://shop.example.com/i/<documentId>`. A customer scans with their phone
camera → opens the product page directly. Two birds, one label.

## Sale-side scanner behaviour

When the in-store barcode scanner reads one of these QR codes, the sale page
must recognise that the value is a URL and **strip the web prefix**, then look
up the item by the trailing identifier:

```
input: "https://shop.example.com/p/PROD-1234"
            ↓ recognise: starts with configured storefront base URL
            ↓ extract last segment: "PROD-1234"
search:    sku == "PROD-1234"  OR  barcode == "PROD-1234"  OR  documentId == "PROD-1234"
```

The behaviour falls back to plain barcode/SKU lookup when the scanned value
doesn't match the storefront prefix, so existing 1D Code128 / Code39 labels
keep working unchanged.

## Suggested implementation

### 1. Label generator

- Add a setting in `BulkPrintPreview` / `UtilContext`:
  `labelQrMode = 'none' | 'value' | 'deep-link'`
  - `none` — no QR (current default for small labels)
  - `value` — encode the raw barcode/sku (current behaviour for some sizes)
  - `deep-link` — encode `<storefront_base_url>/p/<sku-or-docId>`
- Storefront base URL comes from `branch.web` or a dedicated `branch.storefrontUrl`
  field. If both are absent, fall back to `'value'` mode silently.

### 2. Sale-page scanner input

In `SalesItemsForm.handleKeyDown`, before debounced search:

```js
const stripped = stripStorefrontUrl(query, branch);
if (stripped !== query) {
    setQuery(stripped);       // visual feedback
    runSearch(stripped);      // immediate lookup, skip debounce
    return;
}
```

`stripStorefrontUrl(raw, branch)`:
1. Trim whitespace.
2. If it parses as a URL and its origin matches `branch.web` (or another
   configured storefront base), return the last non-empty path segment.
3. Else return `raw` unchanged.

### 3. Tests / edge cases

- Trailing slash, query string, fragment — strip them.
- Multiple storefront URLs (per-brand, per-locale): match any configured.
- Scanner that sends `<CR>` between scans must still work (search input only
  reacts on `Enter`; URL-strip must happen before search debounce, not after).
- Very long URLs encoded as QR — Code128 is 1D so this only affects QR mode;
  Code128 should keep using the raw barcode.

## Why later

The barcode/QR layouts are functional today, and the storefront URL routing
isn't fully nailed down (slug strategy is in-flight per `docs/todo/rutba-web-readable-slug-urls.md`).
Once that lands, wire the deep-link mode here.

## Related files

- `pos-stock/components/print/BulkBarcodePrint.js` — label renderer
- `pos-stock/components/print/BulkPrintPreview.js` — settings panel
- `pos-sale/components/form/sales-items-form.js` — scanner-side strip
- `packages/pos-shared/context/UtilContext.js` — `labelPriceMode` etc.
