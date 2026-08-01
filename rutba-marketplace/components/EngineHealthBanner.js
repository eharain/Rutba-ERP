import { useEffect, useState } from "react";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { appGet } from "./appClient";

// Tells the operator when the engine cannot authenticate with Strapi.
//
// This failure is otherwise invisible from the back office: the browser reads
// Strapi with the operator's OWN jwt, so every screen renders normally while the
// engine — which uses the service token — syncs nothing. The LAN box sat like
// that for four days; the only trace was 401s in a log nobody reads.
//
// Deliberately not a toast: a toast is missable and this condition persists
// until someone changes an env var and restarts the worker.

const POLL_MS = 60 * 1000;

export default function EngineHealthBanner() {
    const { jwt } = useAuth();
    const [health, setHealth] = useState(null);

    useEffect(() => {
        if (!jwt) return undefined;
        let cancelled = false;

        const check = () => {
            appGet("/api/engine/health", jwt)
                .then((r) => { if (!cancelled) setHealth(r); })
                // A failing health check is not itself worth shouting about —
                // it would mean the app's own API is down, which is loud already.
                .catch(() => { if (!cancelled) setHealth(null); });
        };

        check();
        const timer = setInterval(check, POLL_MS);
        return () => { cancelled = true; clearInterval(timer); };
    }, [jwt]);

    if (!health || health.ok) return null;

    const missing = !health.tokenConfigured;
    const since = health.strapiAuth?.since;
    const skipped = health.strapiAuth?.skippedRuns || 0;

    return (
        <div className="alert alert-danger d-flex align-items-start gap-2 mb-3" role="alert">
            <i className="fas fa-plug-circle-xmark mt-1" aria-hidden="true"></i>
            <div className="flex-grow-1">
                <div className="fw-semibold">
                    Marketplace sync is stopped — Strapi rejected the engine&apos;s access token
                </div>
                <div className="small mt-1">
                    {missing ? (
                        <>No service token is configured. Set{" "}
                        <code>RUTBA_MARKETPLACE__STRAPI_SERVICE_TOKEN</code> in the environment
                        and restart the marketplace worker.</>
                    ) : (
                        <>The configured service token was rejected by{" "}
                        <code>{health.strapiApiUrl}</code>. It is missing, expired or belongs to a
                        different database — mint a new one and restart the marketplace worker.</>
                    )}
                </div>
                <div className="small text-muted mt-1">
                    Orders, inventory and catalogue are <strong>not</strong> syncing.
                    {since && <> Failing since {new Date(since).toLocaleString()}.</>}
                    {skipped > 0 && <> {skipped} scheduled run(s) skipped while stopped.</>}
                    {health.probe?.error && (
                        <> <span className="font-monospace">{health.probe.error}</span></>
                    )}
                </div>
            </div>
        </div>
    );
}
