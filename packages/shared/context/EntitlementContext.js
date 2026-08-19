"use client";

/**
 * Which modules exist for this organisation, on the client (portal task E2).
 *
 * The API gate already refuses unentitled calls with a 402
 * (services/core/src/http/entitlement.js). This is the other half: a module the
 * org never bought should not be a tile that 402s when clicked, it should not be
 * a tile. Enforcement without a matching UI is how a product ends up showing
 * people doors that do not open.
 *
 * **No map lives here.** `config/apps.manifest.json` is the single source for
 * which keys an app needs, core reads it, and `/api/entitlements` publishes the
 * result already resolved — `apps[].entitled` per app plus the licence status.
 * A second copy in the browser bundle would be the tenth registry in a repo
 * whose own notes say the existing ones already disagree. So this fetches.
 *
 * FAIL OPEN, deliberately. The endpoint is unauthenticated and answers before
 * there is a session, but it can still be unreachable — and a navigation that
 * empties itself because one request failed is worse than one that shows a
 * module the API will refuse anyway. The API is the enforcement point; this is
 * presentation, and presentation that guesses should guess in the direction that
 * keeps working.
 */

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { webApi } from "@rutba/api-provider/lib/api";

const EntitlementContext = createContext(null);

/** Licence states, as core's resolver reports them. */
export const LICENCE_STATUS = {
  ACTIVE: "active",
  /** Reads pass, writes are refused. A lapsed licence must not cost data entry. */
  GRACE: "grace",
  /** Locked, not deleted. */
  REVOKED: "revoked",
  /** Nothing answered yet, or the request failed. Treated as active. */
  UNKNOWN: "unknown",
};

/** What a user may do with a module right now. */
export const ACCESS = {
  FULL: "full",
  READ_ONLY: "read-only",
  LOCKED: "locked",
  /** Not licensed — absent from navigation rather than shown disabled. */
  UNAVAILABLE: "unavailable",
};

/** The answer before anything has loaded, and after anything has failed. */
const OPEN = Object.freeze({
  status: LICENCE_STATUS.UNKNOWN,
  stale: false,
  source: "none",
  keys: null,
  /** null — not an empty map. Empty would mean "no app is entitled". */
  apps: null,
});

export function EntitlementProvider({ snapshot, children }) {
  const [state, setState] = useState(snapshot || OPEN);
  const [loading, setLoading] = useState(!snapshot);

  useEffect(() => {
    if (snapshot) { setState(snapshot); setLoading(false); return undefined; }
    let live = true;
    webApi
      .get("/entitlements")
      .then((res) => {
        // The endpoint answers a bare object; tolerate a {data} wrapper too so a
        // future envelope change does not silently blank the navigation.
        const body = res?.apps ? res : res?.data;
        if (live && body?.apps) setState({ ...OPEN, ...body });
      })
      // Left open on purpose — see the module note.
      .catch(() => {})
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [snapshot]);

  const value = useMemo(() => buildValue(state, loading), [state, loading]);

  return (
    <EntitlementContext.Provider value={value}>
      {children}
    </EntitlementContext.Provider>
  );
}

function buildValue(state, loading) {
  // Index once: navigation asks per app, for every app, on every render.
  const byKey = new Map((state.apps || []).map((a) => [a.key, a]));

  /** Unknown apps count as entitled — see isEntitled. */
  const isEntitled = (appKey) => {
    if (!state.apps) return true;
    const app = byKey.get(appKey);
    // An app absent from the catalogue is one nobody mapped. Showing it and
    // letting the API decide beats hiding it with no error anywhere to explain
    // why it vanished.
    if (!app) return true;
    return app.entitled !== false;
  };

  const accessMode = (appKey) => {
    // Entitlement before status: an unlicensed module should read "not part of
    // your plan", not "your licence lapsed" — the second is true but answers a
    // question nobody asked and implies buying back something never bought.
    if (!isEntitled(appKey)) {
      return { mode: ACCESS.UNAVAILABLE, reason: "module not licensed for this organisation" };
    }
    const ungated = byKey.get(appKey)?.gated === false;
    if (state.status === LICENCE_STATUS.REVOKED) {
      // Ungated apps degrade rather than lock: an admin has to reach the console
      // to find out why their instance stopped working.
      return ungated
        ? { mode: ACCESS.READ_ONLY, reason: "subscription inactive — administration only" }
        : { mode: ACCESS.LOCKED, reason: "subscription inactive" };
    }
    if (state.status === LICENCE_STATUS.GRACE) {
      return { mode: ACCESS.READ_ONLY, reason: "subscription in grace — changes are paused" };
    }
    return { mode: ACCESS.FULL, reason: "" };
  };

  return {
    loading,
    status: state.status,
    stale: Boolean(state.stale),
    source: state.source,
    keys: state.keys,
    apps: state.apps,
    isEntitled,
    accessMode,
    /**
     * App keys worth showing, in the caller's order. This is what the nav
     * builders in lib/roles.js take, so that nothing outside this file has to
     * know how entitlement is decided.
     */
    entitledAppKeys: (appKeys) => (appKeys || []).filter(isEntitled),
  };
}

const FALLBACK = buildValue(OPEN, false);

/**
 * Entitlement state. Safe with no provider mounted — most apps have not adopted
 * one yet, and the answer without one is the same open answer a failed fetch
 * gives. Adoption is therefore per-app, not a flag day.
 */
export function useEntitlements() {
  return useContext(EntitlementContext) || FALLBACK;
}

/** One module's access, flattened into the booleans a screen branches on. */
export function useAppAccess(appKey) {
  const { accessMode, loading } = useEntitlements();
  return useMemo(() => {
    const { mode, reason } = accessMode(appKey);
    return {
      mode,
      reason,
      loading,
      available: mode !== ACCESS.UNAVAILABLE,
      /** May the page render at all. */
      allowed: mode === ACCESS.FULL || mode === ACCESS.READ_ONLY,
      /** The one worth wiring early: it turns a grace period into a readable
       *  product instead of a wall. */
      readOnly: mode === ACCESS.READ_ONLY,
      locked: mode === ACCESS.LOCKED,
      canMutate: mode === ACCESS.FULL,
    };
  }, [accessMode, appKey, loading]);
}

/**
 * Route gate. Renders children when the module is available, otherwise hands the
 * reason to `fallback` so an app can say "not part of your plan" rather than 404.
 */
export function EntitlementGate({ app, fallback = null, children }) {
  const access = useAppAccess(app);
  const render = useCallback(
    (node) => (typeof node === "function" ? node(access) : node),
    [access]
  );
  if (!access.allowed) return render(fallback);
  return children;
}
