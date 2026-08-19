"use client";

import { getAppName } from "@rutba/api-provider/lib/api";
import { APP_META, APP_URLS } from "../lib/roles";
import { ACCESS } from "../context/EntitlementContext";
import { appAccent } from "./AppHome";

/**
 * What an app shows when the organisation is not licensed for it, or when the
 * subscription has been revoked (portal task E2).
 *
 * Reuses SignInRequired's `.auth-gate` shell on purpose: both are "this app
 * exists but will not open for you right now", and giving them two different
 * looks would imply two different kinds of problem.
 *
 * The copy does not sell. Licensing lives in the portal, buying happens there,
 * and an ERP instance telling a warehouse clerk to upgrade their plan is
 * addressing the wrong person entirely — so this says what is true, names who
 * can change it, and points at the apps they can actually open.
 *
 * @param {string} [app]     app key; defaults to the app this bundle is
 * @param {string} [mode]    ACCESS.UNAVAILABLE | ACCESS.LOCKED
 * @param {string} [reason]  the resolver's own words, as fine print
 */
export default function ModuleUnavailable({ app, mode = ACCESS.UNAVAILABLE, reason }) {
    const appKey = app || getAppName();
    const meta = APP_META[appKey] || {};
    const label = meta.label || "This module";

    const locked = mode === ACCESS.LOCKED;

    const title = locked ? "This module is temporarily locked" : "Not part of your plan";
    const text = locked ? (
        <>
            <strong>{label}</strong>{" "}
            is included in your plan, but your organisation&rsquo;s subscription
            is not active at the moment. Your data is safe and untouched &mdash;
            the module opens again as soon as the subscription is renewed.
        </>
    ) : (
        <>
            <strong>{label}</strong>{" "}
            is not switched on for your organisation. Nothing is missing or
            broken; this module simply is not part of what your organisation
            subscribes to.
        </>
    );

    return (
        <div className="auth-gate is-instant" style={{ "--app-accent": appAccent(appKey) }}>
            <div className="auth-gate-card" role="status">
                <span className="auth-gate-icon" aria-hidden="true">
                    <i className={locked ? "fa-solid fa-lock" : (meta.icon || "fa-solid fa-cube")}></i>
                </span>

                <p className="auth-gate-eyebrow">{label}</p>
                <h1 className="auth-gate-title">{title}</h1>
                <p className="auth-gate-text">{text}</p>

                <a className="auth-gate-btn" href={APP_URLS.auth}>
                    <i className="fa-solid fa-grid-2"></i>
                    Back to your apps
                </a>

                {/* Who to ask. The person hitting this wall is rarely the person
                    who can move it, and "contact support" with no subject is a
                    dead end. */}
                <p className="auth-gate-foot">
                    Your Rutba administrator can change which modules your
                    organisation uses.
                    {reason ? ` (${reason})` : ""}
                </p>
            </div>
        </div>
    );
}
