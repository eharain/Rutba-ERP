import { useEffect, useState } from "react";
import { MediaUtilsEndpoints, SiteSettingEndpoints } from "@rutba/api-provider/endpoints";

/**
 * The branding logo this instance has configured, for the app making the call.
 *
 * The Rutba ERP mark shipped in the repo is the PRODUCT default; each instance
 * overrides it by uploading its own logo in the media library and pointing site
 * settings at it. This hook reads that override — so an app renders the
 * instance's brand, and falls back to its own icon only when no override exists.
 *
 * Site settings are a collection keyed by app_slug, and the server resolves
 * "which row" from the X-Rutba-App header every Rutba client already sends — so
 * this hook takes no app argument. An app with its own row gets its own logo;
 * everything else falls back to the row flagged is_default.
 *
 * Every backend app renders Topbar on every page, so a successful lookup is
 * memoised at module scope: one request per page load, shared across route
 * changes for the life of the SPA session. Failures are NOT memoised — a call
 * that races app bootstrap (no api base url yet, no auth claim yet) must not
 * pin every later mount to "no logo".
 *
 * Returns `{ logoUrl, siteName }`, both null until the lookup lands.
 */

let cached = null;   // last SUCCESSFUL { logoUrl, siteName }
let inFlight = null; // de-dupes concurrent mounts within one page load

async function loadSiteBranding() {
    const res = await SiteSettingEndpoints.fetchDraft({ populate: ["site_logo"] });
    const row = res?.data || res || null;
    if (!row) throw new Error("site-setting resolved to no row");
    return {
        // strapiImageUrl, NOT imageBaseUrl() + url: the media-service provider
        // stores ABSOLUTE urls (https://images.rutba.pk/…) while older
        // local-provider rows are relative (/uploads/…). Concatenating a base
        // onto an absolute url produces `http://host…https://images…`.
        logoUrl: row.site_logo?.url ? MediaUtilsEndpoints.strapiImageUrl(row.site_logo) : null,
        siteName: row.site_name || null,
    };
}

export default function useSiteLogo(jwt) {
    const [branding, setBranding] = useState(cached);

    useEffect(() => {
        if (cached || !jwt) return;
        let alive = true;

        inFlight = inFlight || loadSiteBranding();
        inFlight.then(
            (result) => {
                cached = result;
                inFlight = null;
                if (alive) setBranding(result);
            },
            (err) => {
                // Loud, not silent: a missing top-bar logo is otherwise
                // indistinguishable from "no logo configured", and that
                // ambiguity is expensive to debug from a screenshot.
                inFlight = null;
                console.warn("[useSiteLogo] site-settings logo lookup failed:", err);
            }
        );

        return () => { alive = false; };
    }, [jwt]);

    return branding || { logoUrl: null, siteName: null };
}
