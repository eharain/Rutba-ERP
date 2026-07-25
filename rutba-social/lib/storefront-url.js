import { useEffect, useState } from "react";
import { SiteSettingEndpoints } from "@rutba/api-provider/endpoints";

// Storefront URL resolution for social posts.
//
// A social post's "Shop now" link must point at the product's page on the
// live storefront. The canonical base is site-settings.site_url (the same
// value rutba-web uses to build canonical/SEO URLs); we only fall back to the
// NEXT_PUBLIC_WEB_URL env when site_url isn't set. The product PATH is built
// exactly like the storefront's productHref (slug preferred, documentId
// fallback), so the link resolves to the real product page.

const ENV_WEB_URL = (process.env.NEXT_PUBLIC_WEB_URL || "http://localhost:4000").replace(/\/+$/, "");

let cachedBasePromise = null;

// Fetch site_url from site-settings once per session (module-cached), preferring
// it over the env fallback. GET /site-setting is public (auth:false), so this
// works regardless of the caller's role.
export async function resolveStorefrontBaseUrl() {
    if (cachedBasePromise) return cachedBasePromise;
    cachedBasePromise = (async () => {
        try {
            const res = await SiteSettingEndpoints.getPublished();
            const url = res?.data?.site_url;
            if (url && String(url).trim()) return String(url).trim().replace(/\/+$/, "");
        } catch (err) {
            console.error("Failed to load site_url from site-settings; using env fallback", err);
        }
        return ENV_WEB_URL;
    })();
    return cachedBasePromise;
}

// Canonical product path — mirrors rutba-web/src/lib/product-href.ts
// (slug || documentId). Path only, no host.
export function productPath(p) {
    const key = p?.slug || p?.documentId;
    return key ? `/product/${encodeURIComponent(key)}` : "";
}

// Absolute storefront URL for a product against an already-resolved base.
export function productStorefrontUrl(base, p) {
    const path = productPath(p);
    return path ? `${base}${path}` : base;
}

// React hook: returns the resolved storefront base URL, starting from the env
// fallback and updating to site_url once site-settings loads.
export function useStorefrontBaseUrl() {
    const [base, setBase] = useState(ENV_WEB_URL);
    useEffect(() => {
        let cancelled = false;
        resolveStorefrontBaseUrl().then((b) => { if (!cancelled) setBase(b); });
        return () => { cancelled = true; };
    }, []);
    return base;
}
