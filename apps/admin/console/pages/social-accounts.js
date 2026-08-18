import React, { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/shared/components/ProtectedRoute";
import PermissionCheck from "@rutba/shared/components/PermissionCheck";
import { useAuth } from "@rutba/shared/context/AuthContext";
import { SocialAccountsEndpoints } from "@rutba/api-provider/endpoints";
import { API_URL } from "@rutba/api-provider/lib/api";
import { useToast } from "../components/Toast";
import PLATFORMS, { PlatformBadge } from "../components/PlatformBadge";

const EMPTY_FORM = {
    platform: "instagram",
    connection_type: "api",
    account_name: "",
    api_key: "",
    api_secret: "",
    access_token: "",
    refresh_token: "",
    page_id: "",
    target_name: "",
    platform_user_id: "",
    is_active: true,
};

// Platforms with NO posting API on our side (no provider adapter) — they can
// only be posted to by browser automation (the Rutba Social Poster desktop
// app): no OAuth, no keys, just a destination. Every other platform can be
// EITHER api or browser, so connection_type — not the platform — decides.
const BROWSER_PLATFORMS = new Set(["whatsapp", "linkedin"]);

// Secrets are write-only (private in the schema, so they read back blank) —
// blank must mean "keep the stored value". Everything else is plain data and
// blank means blank, or ids could never be cleared.
const SECRET_FIELDS = ["api_key", "api_secret", "access_token", "refresh_token"];

// Where a browser-posted account publishes, when the platform has no more
// specific label of its own.
const DEFAULT_DESTINATION = {
    key: "target_name",
    label: "Destination",
    placeholder: "profile / page / channel URL the poster publishes to",
};

// Per-platform: which credential fields to show (labelled for that provider) and
// a help panel describing the account + API you need from the platform. The
// underlying storage fields are the same; only the labels/visibility differ.
const PLATFORM_FIELDS = {
    instagram: {
        help: {
            accountType: "Instagram Professional account — Business or Creator. A personal Instagram account cannot post through the API.",
            account: "The Professional account must be linked to a Facebook Page you manage; you sign in through that Facebook login, not directly with Instagram.",
            api: "A Meta app (developers.facebook.com) using the Instagram Graph API, with instagram_basic, instagram_content_publish and instagram_manage_comments.",
            how: "Click Connect and sign in with the Facebook account that manages the Page — or paste a long-lived Page access token + the Instagram Business Account ID.",
            note: "To convert a personal account: Instagram app → Settings → Account type and tools → Switch to professional account.",
            docs: "https://developers.facebook.com/docs/instagram-platform",
        },
        ids: [
            { key: "platform_user_id", label: "Instagram Business Account ID", placeholder: "or the @username for browser posting" },
            { key: "page_id", label: "Facebook Page ID", placeholder: "the Page this account is linked to" },
        ],
        fields: [
            { key: "api_key", label: "Meta App ID", type: "password", placeholder: "for OAuth Connect" },
            { key: "api_secret", label: "Meta App Secret", type: "password" },
            { key: "access_token", label: "Page Access Token", type: "password", placeholder: "long-lived (or use Connect)" },
        ],
    },
    facebook: {
        help: {
            accountType: "A Facebook Page (business/brand page). The API cannot post to a personal profile or timeline.",
            account: "You must be an admin of the Page — or hold a role that grants posting access — for the account you connect.",
            api: "A Meta app with pages_manage_posts, pages_manage_engagement and pages_read_engagement.",
            how: "Click Connect and sign in as the Page admin, then pick the Page — or paste a long-lived Page access token + the Page ID.",
            note: "One Meta app + one login can manage every Page you admin; you choose which Page during Connect.",
            docs: "https://developers.facebook.com/docs/pages-api",
        },
        // The Page this account publishes to (always shown — it's the destination,
        // not a secret). page_id below is the technical id set by Connect.
        destination: { key: "target_name", label: "Page name or URL", placeholder: "the Facebook Page this posts to" },
        ids: [
            { key: "page_id", label: "Facebook Page ID", placeholder: "e.g. 61587364924242 — routes browser posts too" },
        ],
        fields: [
            { key: "api_key", label: "Meta App ID", type: "password", placeholder: "for OAuth Connect" },
            { key: "api_secret", label: "Meta App Secret", type: "password" },
            { key: "access_token", label: "Page Access Token", type: "password", placeholder: "long-lived (or use Connect)" },
        ],
    },
    x: {
        help: {
            accountType: "A standard X (Twitter) account — the handle you want to post from. No special account tier is needed to hold the account.",
            account: "You also need an X Developer account (developer.x.com) with a Project and an App to obtain API access for that handle.",
            api: "X API v2 with OAuth 2.0. Writing posts / reading mentions requires a paid tier (Basic or above); the free tier is heavily read-limited.",
            how: "Set the OAuth2 Client ID + Secret and click Connect. Scopes: tweet.read, tweet.write, users.read, offline.access.",
            note: "The free API tier cannot reliably auto-post — budget for at least the Basic tier if you want scheduled posting.",
            docs: "https://developer.x.com/en/docs/x-api",
        },
        destination: { key: "target_name", label: "Handle", placeholder: "@handle this account posts as" },
        ids: [
            { key: "platform_user_id", label: "X User ID / handle", placeholder: "set by Connect, or the handle for browser posting" },
        ],
        fields: [
            { key: "api_key", label: "OAuth2 Client ID", type: "password" },
            { key: "api_secret", label: "OAuth2 Client Secret", type: "password" },
            { key: "access_token", label: "Access Token", type: "password", placeholder: "set by Connect" },
            { key: "refresh_token", label: "Refresh Token", type: "password", placeholder: "set by Connect" },
        ],
    },
    linkedin: {
        help: {
            accountType: "A LinkedIn profile or company Page you can post from, signed in on the device that runs the Rutba Social Poster desktop app.",
            account: "Log in to LinkedIn in the Social Poster's browser. Posting to a company Page requires an admin role on that Page.",
            api: "LinkedIn's official posting API needs Marketing Developer Platform approval — so posting is done through the Social Poster app (browser automation), no keys or OAuth here.",
            how: "Paste the profile or Page URL below and Save. The Social Poster opens LinkedIn, verifies the signed-in identity against this URL, and publishes there.",
            note: "Use the /in/… URL for a personal profile or the /company/… URL for a company Page.",
            docs: "https://www.linkedin.com/help/linkedin/answer/a522110",
        },
        // LinkedIn posts via browser automation — the profile/Page URL routes the post.
        destination: { key: "target_name", label: "Profile / Page URL", placeholder: "https://www.linkedin.com/in/… or /company/…" },
        ids: [
            { key: "platform_user_id", label: "Profile / Page slug", placeholder: "e.g. rutba-pk-173b89423" },
        ],
        fields: [],
    },
    tiktok: {
        help: {
            accountType: "A TikTok account to post from — a TikTok Business account is recommended for content publishing.",
            account: "You also need a TikTok for Developers app (developers.tiktok.com) with the Content Posting API + Login Kit added.",
            api: "Content Posting API + Login Kit. Your posting domain must be URL-property verified; before your app passes TikTok's audit it can only post privately (SELF_ONLY).",
            how: "Set the Client Key + Secret and click Connect. Scopes: user.info.basic, video.publish, video.upload.",
            note: "Public auto-posting requires submitting the app for TikTok review; until it's approved, use it for private/self posts only.",
            docs: "https://developers.tiktok.com/doc/content-posting-api-get-started",
        },
        destination: { key: "target_name", label: "Handle", placeholder: "@handle this account posts as" },
        ids: [
            { key: "platform_user_id", label: "open_id / @handle", placeholder: "set by Connect, or the handle for browser posting" },
        ],
        fields: [
            { key: "api_key", label: "Client Key", type: "password" },
            { key: "api_secret", label: "Client Secret", type: "password" },
            { key: "access_token", label: "Access Token", type: "password", placeholder: "set by Connect" },
            { key: "refresh_token", label: "Refresh Token", type: "password", placeholder: "set by Connect" },
        ],
    },
    youtube: {
        help: {
            accountType: "A YouTube channel owned by a Google account (a Brand-account channel works too). Posts with a video go to Studio as an upload; text and image posts go to the channel's community tab.",
            account: "Set up a Google Cloud project with the YouTube Data API v3 enabled and an OAuth consent screen for that Google account.",
            api: "YouTube Data API v3. Uploads cost ~1600 quota units each; the default 10,000/day quota is roughly 6 uploads per day.",
            how: "Set the Google OAuth Client ID + Secret and click Connect, then choose the channel. Scopes: youtube.upload, youtube.force-ssl.",
            note: "Request a quota increase in Google Cloud if you plan to upload more than a few videos per day.",
            docs: "https://developers.google.com/youtube/v3/getting-started",
        },
        // YouTube has two destinations on one channel and they live on
        // different hosts: community posts on youtube.com/…/community, video
        // uploads in Studio. Both are recorded so neither has to be guessed.
        destination: { key: "target_name", label: "Community URL", placeholder: "https://www.youtube.com/channel/UC…/community" },
        ids: [
            { key: "page_id", label: "Studio channel URL", placeholder: "https://studio.youtube.com/channel/UC… — used for video uploads" },
            { key: "platform_user_id", label: "Channel ID", placeholder: "UC…" },
        ],
        fields: [
            { key: "api_key", label: "Google OAuth Client ID", type: "password" },
            { key: "api_secret", label: "Google OAuth Client Secret", type: "password" },
            { key: "access_token", label: "Access Token", type: "password", placeholder: "set by Connect" },
            { key: "refresh_token", label: "Refresh Token", type: "password", placeholder: "set by Connect" },
        ],
    },
    whatsapp: {
        help: {
            accountType: "A WhatsApp Channel you administer (the one-to-many broadcast feed). Selling via a WhatsApp Business catalog is a separate integration.",
            account: "You must be an admin of the Channel, signed in on the device that runs the Rutba Social Poster desktop app.",
            api: "Meta has no public API to post to WhatsApp Channels — posting is done through the Social Poster app (browser automation), not the Cloud API.",
            how: "Enter the Channel's exact name below and Save. Publish from the Social Poster app, which opens WhatsApp and posts to that named channel.",
            note: "The name must match the Channel exactly (spelling, case, spacing) so the poster targets the right one.",
            docs: "https://www.whatsapp.com/channels",
        },
        // WhatsApp posts via browser automation — the channel name IS the routing key.
        destination: { key: "target_name", label: "Channel name", placeholder: "exact WhatsApp Channel name" },
        ids: [
            { key: "page_id", label: "Channel ID", placeholder: "the code in whatsapp.com/channel/… (optional)" },
        ],
        fields: [],
    },
};

export default function AccountsPage() {
    const { jwt } = useAuth();
    const { toast, ToastContainer } = useToast();

    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ ...EMPTY_FORM });
    const [saving, setSaving] = useState(false);
    // Which platforms have a server-level OAuth app (→ hide key fields, one-click Connect).
    const [providerStatus, setProviderStatus] = useState(null);
    const [showAdvanced, setShowAdvanced] = useState(false);

    const loadAccounts = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const res = await SocialAccountsEndpoints.list({ sort: ['createdAt:desc'] });
            setAccounts(res.data || []);
        } catch (err) {
            console.error("Failed to load accounts", err);
            toast("Failed to load accounts.", "danger");
        } finally {
            setLoading(false);
        }
    }, [jwt]);

    useEffect(() => { loadAccounts(); }, [loadAccounts]);

    // Learn which platforms are already configured on the server so the form can
    // drop the key-entry fields and offer a plain "Save → Connect" instead.
    useEffect(() => {
        if (!jwt) return;
        SocialAccountsEndpoints.providerStatus()
            .then((res) => setProviderStatus(res?.data || res || null))
            .catch(() => setProviderStatus(null));
    }, [jwt]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        if (name === "platform") {
            setShowAdvanced(false);
            setForm((prev) => ({
                ...prev,
                platform: value,
                // Routing fields mean different things per platform (page_id is a
                // Facebook Page ID but a YouTube Studio URL), so carrying them
                // across a platform switch silently writes nonsense.
                page_id: "",
                platform_user_id: "",
                target_name: "",
                // Platforms with no adapter can only be browser-posted; a platform
                // that has one goes back to the API default.
                connection_type: BROWSER_PLATFORMS.has(value) ? "browser" : "api",
            }));
            return;
        }
        setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
    };

    const openCreate = () => {
        setEditing(null);
        setForm({ ...EMPTY_FORM });
        setShowAdvanced(false);
        setShowForm(true);
    };

    const openEdit = (account) => {
        setEditing(account);
        setForm({
            platform: account.platform || "instagram",
            connection_type: account.connection_type || (BROWSER_PLATFORMS.has(account.platform) ? "browser" : "api"),
            account_name: account.account_name || "",
            api_key: account.api_key || "",
            api_secret: account.api_secret || "",
            access_token: account.access_token || "",
            refresh_token: account.refresh_token || "",
            page_id: account.page_id || "",
            target_name: account.target_name || "",
            platform_user_id: account.platform_user_id || "",
            is_active: account.is_active !== false,
        });
        setShowAdvanced(false);
        setShowForm(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const data = { ...form };
            if (editing) {
                // Secret fields aren't returned to the client (private), so they
                // load blank — blank must mean "keep the stored value", not wipe
                // it. Ids (page_id / platform_user_id) DO load, so blank there is
                // a deliberate clear and must be sent through.
                for (const k of SECRET_FIELDS) {
                    if (!data[k]) delete data[k];
                }
            }
            const payload = { data };
            if (editing) {
                await SocialAccountsEndpoints.update(editing.documentId, payload);
                toast("Account updated.", "success");
            } else {
                await SocialAccountsEndpoints.create(payload);
                toast("Account created.", "success");
            }
            setShowForm(false);
            setEditing(null);
            setForm({ ...EMPTY_FORM });
            await loadAccounts();
        } catch (err) {
            console.error("Failed to save account", err);
            toast("Failed to save account.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (account) => {
        if (!confirm(`Delete account "${account.account_name}"?`)) return;
        try {
            await SocialAccountsEndpoints.del(account.documentId);
            toast("Account deleted.", "success");
            await loadAccounts();
        } catch (err) {
            console.error("Failed to delete account", err);
            toast("Failed to delete account.", "danger");
        }
    };

    // ── OAuth connect ────────────────────────────────────────
    const [busyId, setBusyId] = useState(null);

    // Listen for the popup-closer's postMessage and refresh on success.
    useEffect(() => {
        // The OAuth callback page is served from the API origin; only trust
        // messages from there (or our own origin) so another tab can't forge one.
        let apiOrigin = null;
        try { apiOrigin = new URL(API_URL).origin; } catch { /* leave null */ }
        const onMessage = (e) => {
            if (apiOrigin && e.origin !== apiOrigin && e.origin !== window.location.origin) return;
            const d = e.data;
            if (!d || d.source !== "apps/content/social-oauth") return;
            if (d.ok) {
                toast(`Connected ${d.message || ""}`.trim(), "success");
                loadAccounts();
            } else {
                toast(d.message || "Connection failed.", "danger");
            }
        };
        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, [loadAccounts]);

    const handleConnect = async (account) => {
        setBusyId(account.documentId);
        try {
            const res = await SocialAccountsEndpoints.getConnectUrl(account.documentId);
            const url = res?.url || res?.data?.url;
            if (!url) { toast("No connect URL returned. Set this platform's OAuth client id/secret on the server.", "warning"); return; }
            const w = 600, h = 720;
            const left = window.screenX + (window.outerWidth - w) / 2;
            const top = window.screenY + (window.outerHeight - h) / 2;
            const popup = window.open(url, "apps/content/social-oauth", `width=${w},height=${h},left=${left},top=${top}`);
            if (!popup || popup.closed || typeof popup.closed === "undefined") {
                toast("Popup blocked — allow popups for this site, then click Connect again.", "warning");
            }
        } catch (err) {
            console.error("Failed to start OAuth", err);
            toast(err?.response?.data?.error?.message || "Could not start OAuth. Is the platform's client id/secret configured?", "danger");
        } finally {
            setBusyId(null);
        }
    };

    const handleTest = async (account) => {
        setBusyId(account.documentId);
        try {
            const res = await SocialAccountsEndpoints.validateConnection(account.documentId);
            const r = res?.data || res;
            if (r?.ok) {
                toast(`✅ ${account.account_name} is connected${r.token_expires_at ? ` (token valid until ${new Date(r.token_expires_at).toLocaleString()})` : ""}.`, "success");
            } else {
                toast(`⚠️ ${r?.reason || "Not connected."}`, "warning");
            }
        } catch (err) {
            console.error("Test failed", err);
            toast("Connection test failed.", "danger");
        } finally {
            setBusyId(null);
        }
    };

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <PermissionCheck adminOnly appKey="admin" required="admin">
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h3><i className="fas fa-key me-2"></i>Social Accounts</h3>
                    <button className="btn btn-primary btn-sm" onClick={openCreate}>
                        <i className="fas fa-plus me-1"></i>Add Account
                    </button>
                </div>

                {showForm && (
                    <div className="card mb-4">
                        <div className="card-body">
                            <h5>{editing ? "Edit Account" : "New Account"}</h5>
                            <form onSubmit={handleSubmit}>
                                <div className="row g-3">
                                    <div className="col-md-3">
                                        <label className="form-label">Platform</label>
                                        <select className="form-select" name="platform" value={form.platform} onChange={handleChange}>
                                            {Object.entries(PLATFORMS).map(([key, p]) => (
                                                <option key={key} value={key}>{p.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="col-md-3">
                                        <label className="form-label">Posted by</label>
                                        {BROWSER_PLATFORMS.has(form.platform) ? (
                                            <input className="form-control" value="Desktop app (only option)" disabled readOnly />
                                        ) : (
                                            <select className="form-select" name="connection_type" value={form.connection_type} onChange={handleChange}>
                                                <option value="api">Platform API (OAuth)</option>
                                                <option value="browser">Rutba Social Poster (desktop app)</option>
                                            </select>
                                        )}
                                    </div>
                                    <div className="col-md-6">
                                        <label className="form-label">Account Name <span className="text-muted small">(a label for you)</span></label>
                                        <input className="form-control" name="account_name" value={form.account_name} onChange={handleChange} required placeholder="e.g. Rutba Official" />
                                    </div>

                                    {/* Provider help + credential fields. When this platform's OAuth
                                        app is already configured on the server, we hide the key fields
                                        and collapse to a plain Save → Connect (keys stay behind Advanced,
                                        for tenants who bring their own app or paste a long-lived token). */}
                                    {(() => {
                                        const cfg = PLATFORM_FIELDS[form.platform];
                                        if (!cfg) return null;
                                        const label = PLATFORMS[form.platform]?.label;
                                        // The ACCOUNT's posting method decides the UI, not the platform —
                                        // a Facebook/TikTok/… account created by the desktop poster is
                                        // browser-connected and has no OAuth to show.
                                        const isBrowser = BROWSER_PLATFORMS.has(form.platform) || form.connection_type === "browser";
                                        const serverReady = !isBrowser && !!providerStatus?.platforms?.[form.platform];
                                        const dest = cfg.destination || (isBrowser ? DEFAULT_DESTINATION : null);
                                        return (
                                            <>
                                                <div className="col-12">
                                                    <div className="alert alert-info py-2 mb-0 small">
                                                        <div className="fw-semibold mb-2">
                                                            <i className={`${PLATFORMS[form.platform]?.icon} me-1`}></i>
                                                            What you need for {label}
                                                        </div>
                                                        {cfg.help.accountType && (
                                                            <div className="mb-1 d-flex align-items-start">
                                                                <span className="badge bg-primary me-2 flex-shrink-0">Account type</span>
                                                                <span>{cfg.help.accountType}</span>
                                                            </div>
                                                        )}
                                                        <div><strong>Account setup:</strong> {cfg.help.account}</div>
                                                        <div><strong>API access:</strong> {cfg.help.api}</div>
                                                        <div><strong>How to connect:</strong> {isBrowser && !BROWSER_PLATFORMS.has(form.platform)
                                                            ? `This account is posted by the Rutba Social Poster desktop app — log in to ${label} in its browser, set the destination below, and Save. No keys or OAuth.`
                                                            : serverReady
                                                                ? "This platform is already set up on the server — just Save, then click Connect to sign in. No keys to enter."
                                                                : cfg.help.how}</div>
                                                        {cfg.help.note && (
                                                            <div className="mt-1 text-body-secondary">
                                                                <i className="fas fa-circle-info me-1"></i>{cfg.help.note}
                                                            </div>
                                                        )}
                                                        {cfg.help.docs && (
                                                            <div className="mt-1">
                                                                <a href={cfg.help.docs} target="_blank" rel="noopener noreferrer">
                                                                    <i className="fas fa-book me-1"></i>Provider setup docs
                                                                </a>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Destination (Page / Channel name) — always shown; it's
                                                    where this account posts to, not a secret. */}
                                                {dest && (
                                                    <div className="col-md-6">
                                                        <label className="form-label">
                                                            {dest.label}
                                                            <span className="text-muted small ms-1">(where this account posts)</span>
                                                        </label>
                                                        <input
                                                            className="form-control"
                                                            name={dest.key}
                                                            value={form[dest.key] || ""}
                                                            onChange={handleChange}
                                                            placeholder={dest.placeholder || ""}
                                                            autoComplete="off"
                                                        />
                                                    </div>
                                                )}

                                                {/* Routing ids (Page ID / Channel ID / handle) — plain data,
                                                    never secrets, so they are always visible and always
                                                    editable, whichever way this account posts. */}
                                                {(cfg.ids || []).map((f) => (
                                                    <div className="col-md-6" key={f.key}>
                                                        <label className="form-label">{f.label}</label>
                                                        <input
                                                            className="form-control"
                                                            name={f.key}
                                                            value={form[f.key] || ""}
                                                            onChange={handleChange}
                                                            placeholder={f.placeholder || ""}
                                                            autoComplete="off"
                                                        />
                                                    </div>
                                                ))}

                                                {isBrowser ? (
                                                    <div className="col-12">
                                                        <div className="alert alert-secondary py-2 mb-0 small">
                                                            <i className={`${PLATFORMS[form.platform]?.icon} me-1`}></i>
                                                            Posts to {label} are published by the <strong>Rutba Social Poster</strong> desktop app (browser automation) — there are no API keys or OAuth. Enter the {dest?.label?.toLowerCase() || "destination"} above and Save; the app posts to that destination.
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        {serverReady ? (
                                                            <div className="col-12">
                                                                <div className="alert alert-success py-2 mb-0 small">
                                                                    <i className="fas fa-check-circle me-1"></i>
                                                                    {label}&apos;s app is configured on the server. Name this account, click <strong>Save</strong>, then hit <strong>Connect</strong> on its row to sign in — nothing to paste.
                                                                </div>
                                                                <button type="button" className="btn btn-link btn-sm px-0 mt-1"
                                                                    onClick={() => setShowAdvanced((v) => !v)}>
                                                                    {showAdvanced ? "Hide advanced options" : "Advanced — use my own app / paste a token"}
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <div className="col-12">
                                                                <div className="alert alert-warning py-2 mb-0 small">
                                                                    No server-level app is set for {label}. Enter your own developer-app credentials below — or set the <code>SOCIAL_…</code> env vars on the server once, and adding accounts becomes one-click.
                                                                </div>
                                                            </div>
                                                        )}

                                                        {(!serverReady || showAdvanced) && cfg.fields.map((f) => (
                                                            <div className="col-md-6" key={f.key}>
                                                                <label className="form-label">{f.label}</label>
                                                                <input
                                                                    className="form-control"
                                                                    name={f.key}
                                                                    value={form[f.key] || ""}
                                                                    onChange={handleChange}
                                                                    type={f.type || "text"}
                                                                    placeholder={f.placeholder || ""}
                                                                    autoComplete="off"
                                                                />
                                                            </div>
                                                        ))}
                                                    </>
                                                )}
                                            </>
                                        );
                                    })()}

                                    <div className="col-12">
                                        <div className="form-check">
                                            <input className="form-check-input" type="checkbox" name="is_active" checked={form.is_active} onChange={handleChange} id="isActive" />
                                            <label className="form-check-label" htmlFor="isActive">Active</label>
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-3 d-flex gap-2">
                                    <button className="btn btn-success btn-sm" type="submit" disabled={saving}>
                                        {saving ? "Saving..." : "Save"}
                                    </button>
                                    <button className="btn btn-secondary btn-sm" type="button" onClick={() => { setShowForm(false); setEditing(null); }}>
                                        Cancel
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className="text-center py-5"><div className="spinner-border"></div></div>
                ) : accounts.length === 0 ? (
                    <div className="alert alert-info">No social accounts configured yet. Click "Add Account" to connect a platform.</div>
                ) : (
                    <div className="table-responsive">
                        <table className="table table-hover align-middle">
                            <thead>
                                <tr>
                                    <th>Platform</th>
                                    <th>Account Name</th>
                                    <th>Page / Channel ID</th>
                                    <th>Status</th>
                                    <th>Connection</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {accounts.map((acc) => {
                                  const isBrowserAcc = acc.connection_type === "browser" || BROWSER_PLATFORMS.has(acc.platform);
                                  return (
                                    <tr key={acc.id}>
                                        <td><PlatformBadge platform={acc.platform} /></td>
                                        <td>
                                            {acc.account_name}
                                            {acc.target_name && (
                                                <div className="small text-muted"><i className="fas fa-bullseye me-1"></i>{acc.target_name}</div>
                                            )}
                                        </td>
                                        <td><code>{acc.page_id || acc.platform_user_id || acc.target_name || "—"}</code></td>
                                        <td>
                                            {acc.is_active
                                                ? <span className="badge bg-success">Active</span>
                                                : <span className="badge bg-secondary">Inactive</span>}
                                        </td>
                                        <td>
                                            {isBrowserAcc ? (
                                                <span className="badge bg-secondary" title="Published by the Rutba Social Poster desktop app">
                                                    <i className="fas fa-desktop me-1"></i>Desktop app
                                                </span>
                                            ) : acc.last_connected_at ? (
                                                <span className="badge bg-success" title={new Date(acc.last_connected_at).toLocaleString()}>
                                                    <i className="fas fa-link me-1"></i>Connected
                                                </span>
                                            ) : (
                                                <span className="badge bg-light text-dark border"><i className="fas fa-unlink me-1"></i>Not connected</span>
                                            )}
                                        </td>
                                        <td>
                                            <div className="d-flex gap-1">
                                                {isBrowserAcc ? (
                                                    <span className="badge bg-light text-dark border align-self-center" title="Posts via the Rutba Social Poster desktop app">
                                                        <i className="fas fa-desktop me-1"></i>Via Social Poster
                                                    </span>
                                                ) : (
                                                    <>
                                                        <button className="btn btn-sm btn-outline-success" title="Connect via OAuth" disabled={busyId === acc.documentId} onClick={() => handleConnect(acc)}>
                                                            {busyId === acc.documentId ? <span className="spinner-border spinner-border-sm"></span> : <><i className="fas fa-plug me-1"></i>Connect</>}
                                                        </button>
                                                        <button className="btn btn-sm btn-outline-secondary" title="Test connection" disabled={busyId === acc.documentId} onClick={() => handleTest(acc)}>
                                                            <i className="fas fa-heartbeat"></i>
                                                        </button>
                                                    </>
                                                )}
                                                <button className="btn btn-sm btn-outline-primary" title="Edit" onClick={() => openEdit(acc)}>
                                                    <i className="fas fa-pen"></i>
                                                </button>
                                                <button className="btn btn-sm btn-outline-danger" title="Delete" onClick={() => handleDelete(acc)}>
                                                    <i className="fas fa-trash"></i>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                </PermissionCheck>
            </Layout>
        </ProtectedRoute>
    );
}
