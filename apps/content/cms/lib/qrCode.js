import { useEffect, useState } from "react";
import { SiteSettingEndpoints } from "@rutba/api-provider/endpoints";
import { APP_URLS } from "@rutba/pos-shared/lib/roles";

/**
 * QR codes for print material.
 *
 * Every printed QR encodes `<storefront>/qr/<code>` rather than a direct
 * product/page URL. The storefront resolves the code at scan time against
 * products, collections, CMS pages and page-groups (pos-strapi
 * src/api/qr/services/qr.js), which means:
 *
 *   - one QR shape works for every entity type, so this generator does too;
 *   - a code survives the thing behind it being re-modelled or re-routed;
 *   - a code that becomes ambiguous shows a chooser instead of 404-ing.
 *
 * The trade-off is an extra hop on scan. That is the right side of the trade
 * when the alternative is a wrong URL printed on a few thousand labels.
 */

const ENV_WEB_URL = (APP_URLS.web || "").replace(/\/+$/, "");

let cachedBasePromise = null;

/**
 * Canonical storefront base. site-settings.site_url wins over the env because
 * the CMS's NEXT_PUBLIC_WEB_URL points wherever *this* deployment's storefront
 * runs, which on a staging box is not the host that ends up on the label.
 * GET /site-setting is public (auth:false), so this works for any role.
 */
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

/** React hook: env fallback first, swapped for site_url once it loads. */
export function useStorefrontBaseUrl() {
    const [base, setBase] = useState(ENV_WEB_URL);
    useEffect(() => {
        let cancelled = false;
        resolveStorefrontBaseUrl().then((b) => { if (!cancelled) setBase(b); });
        return () => { cancelled = true; };
    }, []);
    return base;
}

/**
 * The entity kinds a QR can point at. `codeOf` mirrors the lookup keys in the
 * resolver service — keep the two in step or a generated code won't resolve.
 */
export const QR_KINDS = {
    "cms-page": {
        label: "Page",
        // Slug is required on cms-page, so there is no fallback to arrange.
        codeOf: (e) => e?.slug || "",
        titleOf: (e) => e?.title || e?.slug || "",
    },
    "cms-page-group": {
        label: "Page group",
        codeOf: (e) => e?.slug || "",
        titleOf: (e) => e?.title || e?.name || e?.slug || "",
    },
    "product-group": {
        label: "Collection",
        codeOf: (e) => e?.slug || "",
        titleOf: (e) => e?.title || e?.name || e?.slug || "",
    },
    product: {
        // qr_code first: it is the only key an editor can set deliberately, so
        // it must beat the auto-generated slug when both exist.
        label: "Product",
        codeOf: (e) => e?.qr_code || e?.slug || e?.documentId || "",
        titleOf: (e) => e?.name || e?.slug || "",
    },
};

/** Which field the code came from — shown in the UI so editors can see why. */
export function qrCodeSource(kind, entity) {
    if (kind === "product") {
        if (entity?.qr_code) return "qr_code";
        if (entity?.slug) return "slug";
        if (entity?.documentId) return "documentId";
        return null;
    }
    return entity?.slug ? "slug" : null;
}

export function qrCodeFor(kind, entity) {
    return QR_KINDS[kind]?.codeOf(entity) || "";
}

/** Absolute URL to encode in the QR. Empty when the entity has no usable code. */
export function buildQrUrl(base, kind, entity) {
    const code = qrCodeFor(kind, entity);
    if (!code) return "";
    return `${(base || "").replace(/\/+$/, "")}/qr/${encodeURIComponent(code)}`;
}

/**
 * Printable label sizes. `qr` is the on-paper module size in CSS pixels; at
 * 96dpi the medium preset puts a ~1.35in symbol on a 2in label, which scans
 * reliably from arm's length. Anything smaller than the small preset starts to
 * fail on phone cameras once ink spread is accounted for.
 */
export const QR_LABEL_SIZES = [
    { key: "sm", label: 'Small — 1.5"', qr: 90, width: "1.5in", height: "1.5in" },
    { key: "md", label: 'Medium — 2"', qr: 130, width: "2in", height: "2in" },
    { key: "lg", label: 'Large — 3"', qr: 200, width: "3in", height: "3in" },
];
