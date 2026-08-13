import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { MediaUtilsEndpoints, SocialPostsEndpoints, SocialAccountsEndpoints, SocialRelayProvidersEndpoints } from "@rutba/api-provider/endpoints";
import { useToast } from "../../components/Toast";
import PLATFORMS, { PlatformBadge } from "../../components/PlatformBadge";
import ExcelIO from "../../components/ExcelIO";
import Link from "next/link";
import { imageItems, hasVideo } from "../../lib/video-maker";

// Everything is fetched up front (like the studio always did) because half the
// filters — has-video, published-on-platform — live in JSON columns the API
// cannot filter on. Filtering and paging then happen client-side.
const FETCH_PAGE = 50;
const MAX_PAGES = 20;
const CARDS_PER_PAGE = 24;
const VIEW_KEY = "rutba-social-posts-view";

// Bulk-edit columns. documentId/id/contentType/publish are auto-emitted by
// ExcelIO. Keep the documentId on a row to update it; clear it (or add a new
// row) to create a draft. platforms/tags round-trip as comma-separated lists.
const POST_EXCEL_COLUMNS = [
    { key: "title", isLabel: true, width: 36 },
    { key: "body", width: 90 },
    {
        key: "platforms", width: 30,
        format: (r) => (Array.isArray(r.platforms) ? r.platforms.join(", ") : (r.platforms || "")),
        parse: (cell) => String(cell).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
    },
    {
        key: "tags", width: 28,
        format: (r) => (Array.isArray(r.tags) ? r.tags.join(", ") : (r.tags || "")),
        parse: (cell) => String(cell).split(",").map((s) => s.trim()).filter(Boolean),
    },
    {
        key: "scheduled_at", width: 20,
        format: (r) => (r.scheduled_at ? new Date(r.scheduled_at).toISOString() : ""),
        // Normalize whatever Excel hands back: an ISO string round-trips as-is,
        // but a cell the user reformatted comes back as a Date or an Excel
        // serial number — convert both to ISO so Strapi accepts it.
        parse: (cell) => {
            if (cell === "" || cell === null || cell === undefined) return undefined;
            if (cell instanceof Date) return cell.toISOString();
            if (typeof cell === "number") {
                const d = new Date(Math.round((cell - 25569) * 86400 * 1000)); // Excel serial → epoch
                return isNaN(d.getTime()) ? undefined : d.toISOString();
            }
            const d = new Date(String(cell).trim());
            return isNaN(d.getTime()) ? String(cell).trim() : d.toISOString();
        },
    },
    {
        // Only draft | scheduled are meaningful to set in bulk; publishing/failed
        // states are owned by the Publish flow. Anything else is dropped (left
        // unchanged) so a stray value can't corrupt a post's status.
        key: "post_status", width: 18,
        format: (r) => r.post_status || "draft",
        parse: (cell) => {
            const v = String(cell).trim().toLowerCase();
            return (v === "draft" || v === "scheduled") ? v : undefined;
        },
    },
    {
        key: "published_at_social", width: 22, readOnly: true,
        format: (r) => (r.published_at_social ? new Date(r.published_at_social).toISOString() : ""),
    },
];

// Per-destination outcome, as recorded in platform_results under
// `<platform>#<accountDocumentId>`. `pending` = handed to the Rutba Social
// Poster desktop app and not yet confirmed, which is progress, not failure.
const RESULT_STATE = {
    success: { cls: "bg-success", icon: "fa-check", label: "posted" },
    pending: { cls: "bg-info", icon: "fa-hourglass-half", label: "queued for the Social Poster app" },
    unverified: { cls: "bg-warning text-dark", icon: "fa-question", label: "clicked but not confirmed — check the platform" },
    error: { cls: "bg-danger", icon: "fa-xmark", label: "failed" },
    failed: { cls: "bg-danger", icon: "fa-xmark", label: "failed" },
    removed: { cls: "bg-secondary", icon: "fa-eraser", label: "removed from the platform" },
};

// One chip per social account this post is meant to reach, flagged with whether
// it actually went out there. The link is platform_results' per-account key, so
// two accounts on the same platform are tracked separately.
function AccountFlags({ post, accounts, collapsed = false, onToggle }) {
    const results = post.platform_results || {};
    const targeted = Array.isArray(post.platforms) && post.platforms.length ? post.platforms : null;
    const rows = accounts.filter((a) => !targeted || targeted.includes(a.platform));

    // No account exists for these platforms yet — show what it targets instead.
    if (!rows.length) {
        return (post.platforms || []).map((p) => <PlatformBadge key={p} platform={p} />);
    }
    const done = rows.filter((a) => results[`${a.platform}#${a.documentId}`]?.status === "success").length;
    // Relay pushes land under `<platform>#relay:<relayDocId>` — surface them as
    // their own chips so a relayed post doesn't look unposted.
    const relayRows = Object.entries(results)
        .filter(([, v]) => v && String(v.account_id || "").startsWith("relay:"));

    // Collapsed: the one number that matters plus the platforms it involves.
    // A card carrying six account chips buries the caption and the actions,
    // and most of the time "3/5, on these platforms" is the whole question.
    if (collapsed) {
        const platforms = [...new Set(rows.map((a) => a.platform))];
        return (
            <button type="button" onClick={onToggle}
                className="btn btn-sm p-0 border-0 bg-transparent d-inline-flex align-items-center gap-1"
                title={`${done} of ${rows.length} account(s) posted — click for the breakdown`}>
                <span className={`badge ${done === rows.length ? "bg-success" : done ? "bg-warning text-dark" : "bg-light text-dark border"}`}>
                    {done}/{rows.length}
                </span>
                {platforms.slice(0, 4).map((p) => (
                    <i key={p} className={PLATFORMS[p]?.icon || "fas fa-share-nodes"}
                        style={{ color: PLATFORMS[p]?.color, fontSize: 11 }} />
                ))}
                {platforms.length > 4 && <span className="text-muted" style={{ fontSize: 10 }}>+{platforms.length - 4}</span>}
                {relayRows.length > 0 && <i className="fas fa-tower-broadcast text-muted" style={{ fontSize: 10 }} title="relayed" />}
                <i className="fas fa-chevron-down text-muted" style={{ fontSize: 9 }} />
            </button>
        );
    }

    return (
        <div className="d-flex flex-wrap gap-1 align-items-center">
            <button type="button" onClick={onToggle}
                className="btn btn-sm p-0 border-0 bg-transparent"
                title="Accounts posted / accounts targeted — click to collapse">
                <span className="badge bg-light text-dark border">
                    {done}/{rows.length} <i className="fas fa-chevron-up" style={{ fontSize: 9 }} />
                </span>
            </button>
            {rows.map((a) => {
                const r = results[`${a.platform}#${a.documentId}`];
                const st = r && RESULT_STATE[r.status];
                const p = PLATFORMS[a.platform] || {};
                const detail = r?.error || r?.note || "";
                return (
                    <span
                        key={a.documentId}
                        className={`badge ${st ? st.cls : "bg-light text-muted border"} d-inline-flex align-items-center`}
                        style={{ maxWidth: 190 }}
                        title={`${a.account_name} (${a.platform}) — ${st ? st.label : "not posted yet"}${detail ? ": " + detail : ""}`}
                    >
                        <i className={`${p.icon || "fas fa-share-nodes"} me-1`}></i>
                        <i className={`fas ${st ? st.icon : "fa-minus"} me-1`}></i>
                        <span className="text-truncate">{a.account_name}</span>
                    </span>
                );
            })}
            {relayRows.map(([key, r]) => {
                const st = RESULT_STATE[r.status];
                const p = PLATFORMS[r.platform] || {};
                const detail = r.error || r.note || "";
                return (
                    <span
                        key={key}
                        className={`badge ${st ? st.cls : "bg-light text-muted border"} d-inline-flex align-items-center`}
                        style={{ maxWidth: 190 }}
                        title={`${r.account_name || "relay"} → ${r.platform} (relay) — ${st ? st.label : r.status}${detail ? ": " + detail : ""}`}
                    >
                        <i className={`${p.icon || "fas fa-share-nodes"} me-1`}></i>
                        <i className="fas fa-tower-broadcast me-1"></i>
                        <i className={`fas ${st ? st.icon : "fa-minus"}`}></i>
                    </span>
                );
            })}
        </div>
    );
}

// Push-via-relay button. One relay = plain button; several = a small dropdown
// with "All relays" plus one entry per relay. `iconOnly` fits the card footer.
function RelayPushButton({ relays, count, iconOnly, dropUp, disabled, onPick }) {
    const [open, setOpen] = useState(false);
    if (!relays.length) return null;
    const label = iconOnly ? null : `Relay${count > 1 ? ` (${count})` : ""}`;
    if (relays.length === 1) {
        return (
            <button className={`btn btn-sm ${iconOnly ? "btn-outline-info" : "btn-info"}`} disabled={disabled}
                onClick={() => onPick(relays[0])}
                title={`Push via ${relays[0].name} (${(relays[0].platforms || []).join(", ") || "no platforms"})`}>
                <i className={`fas fa-tower-broadcast${label ? " me-1" : ""}`}></i>{label}
            </button>
        );
    }
    return (
        <div className="btn-group position-relative">
            <button className={`btn btn-sm ${iconOnly ? "btn-outline-info" : "btn-info"} dropdown-toggle`}
                disabled={disabled} onClick={() => setOpen((v) => !v)} title="Push via a relay provider">
                <i className={`fas fa-tower-broadcast${label ? " me-1" : ""}`}></i>{label}
            </button>
            {open && (
                <div className="dropdown-menu show shadow-sm"
                    style={{ position: "absolute", right: 0, zIndex: 1050, ...(dropUp ? { bottom: "100%" } : { top: "100%" }) }}>
                    <button className="dropdown-item" onClick={() => { setOpen(false); onPick(null); }}>
                        <i className="fas fa-tower-broadcast me-1"></i>All relays
                    </button>
                    <div className="dropdown-divider"></div>
                    {relays.map((r) => (
                        <button key={r.documentId} className="dropdown-item" onClick={() => { setOpen(false); onPick(r); }}>
                            {r.name}
                            <span className="text-muted small ms-1">({(r.platforms || []).join(", ") || "no platforms"})</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

const POST_STATUS_BADGES = {
    draft: "bg-secondary",
    scheduled: "bg-warning text-dark",
    publishing: "bg-info",
    published: "bg-success",
    partially_published: "bg-warning",
    failed: "bg-danger",
};

// Sorts worth having: each answers a question someone actually asks of this
// list. `oldest` finds the backlog, `updated` finds what was just worked on,
// `scheduled` is the queue in the order it will go out, `accounts` surfaces
// the widest-reach posts, and `reach` ranks by how much of that reach has
// actually been delivered.
const SORTS = {
    newest: { label: "Newest first", cmp: (a, b) => str(b.createdAt).localeCompare(str(a.createdAt)) },
    oldest: { label: "Oldest first", cmp: (a, b) => str(a.createdAt).localeCompare(str(b.createdAt)) },
    updated: { label: "Recently updated", cmp: (a, b) => str(b.updatedAt).localeCompare(str(a.updatedAt)) },
    title: { label: "Title A–Z", cmp: (a, b) => str(a.title).localeCompare(str(b.title)) },
    status: {
        label: "Status",
        cmp: (a, b) => STATUS_ORDER.indexOf(a.post_status || "draft") - STATUS_ORDER.indexOf(b.post_status || "draft")
            || str(b.createdAt).localeCompare(str(a.createdAt)),
    },
    scheduled: {
        // Unscheduled posts sink; among the scheduled, soonest first — the
        // order they will actually go out in.
        label: "Scheduled soonest",
        cmp: (a, b) => (a.scheduled_at ? 0 : 1) - (b.scheduled_at ? 0 : 1)
            || str(a.scheduled_at).localeCompare(str(b.scheduled_at)),
    },
    published: {
        label: "Recently published",
        cmp: (a, b) => str(b.published_at_social).localeCompare(str(a.published_at_social)),
    },
    accounts: { label: "Most accounts posted", cmp: (a, b) => successCount(b) - successCount(a) },
    reach: {
        // Least-delivered first: the posts still owing the most destinations.
        label: "Least delivered",
        cmp: (a, b) => successCount(a) - successCount(b) || str(b.createdAt).localeCompare(str(a.createdAt)),
    },
    photos: { label: "Most photos", cmp: (a, b) => imageItems(b).length - imageItems(a).length },
};

const STATUS_ORDER = ["failed", "partially_published", "publishing", "scheduled", "draft", "published"];
const str = (v) => (v == null ? "" : String(v));
const successCount = (post) =>
    Object.values(post.platform_results || {}).filter((v) => v?.status === "success").length;

// Did any destination on this platform confirm the post? Keys are
// `<platform>#<accountDocId>` (bare `<platform>` on old rows).
const publishedOn = (post, platform) => Object.entries(post.platform_results || {})
    .some(([k, v]) => (k === platform || k.startsWith(`${platform}#`)) && v?.status === "success");
const publishedAnywhere = (post) =>
    Object.values(post.platform_results || {}).some((v) => v?.status === "success");
// An empty platforms list targets every connected account (see AccountFlags).
const targetsPlatform = (post, platform) =>
    !(post.platforms || []).length || post.platforms.includes(platform);

export default function PostsPage() {
    const { jwt } = useAuth();
    const { toast, ToastContainer } = useToast();
    const router = useRouter();

    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [publishing, setPublishing] = useState({});
    // Active accounts drive the per-account "posted / not posted" flags.
    const [accounts, setAccounts] = useState([]);
    // Active relay providers drive the "push via relay" buttons.
    const [relays, setRelays] = useState([]);

    // ── filters ─────────────────────────────────────────────
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [videoFilter, setVideoFilter] = useState("all"); // all | with | without
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    // Two independent conditions so they can combine — e.g. posts already on
    // YouTube that still owe TikTok. "" = off, "any" = any platform.
    const [publishedOnFilter, setPublishedOnFilter] = useState("");
    const [notPublishedOnFilter, setNotPublishedOnFilter] = useState("");
    const [sortKey, setSortKey] = useState("newest");

    // ── card layout ─────────────────────────────────────────
    // Two switches set what every card shows; a card's own toggle then flips
    // that card away from the default. Storing the FLIPS (not each card's
    // absolute state) is what makes "hide all captions" still mean something
    // after you have opened one — and flipping a switch clears them, so the
    // switch is always telling the truth about what you are looking at.
    const [showCaptions, setShowCaptions] = useState(false);
    const [showAccounts, setShowAccounts] = useState(true);
    const [captionFlips, setCaptionFlips] = useState(() => new Set());
    const [accountFlips, setAccountFlips] = useState(() => new Set());

    const captionOpen = (id) => showCaptions !== captionFlips.has(id);
    const accountsOpen = (id) => showAccounts !== accountFlips.has(id);
    const flip = (setter) => (id) => setter((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });
    const flipCaption = flip(setCaptionFlips);
    const flipAccounts = flip(setAccountFlips);

    // A view preference is worth keeping — it is about how you read this page,
    // not about what you were looking for.
    useEffect(() => {
        try {
            const raw = localStorage.getItem(VIEW_KEY);
            if (!raw) return;
            const v = JSON.parse(raw);
            if (typeof v.captions === "boolean") setShowCaptions(v.captions);
            if (typeof v.accounts === "boolean") setShowAccounts(v.accounts);
        } catch { /* defaults are fine */ }
    }, []);
    useEffect(() => {
        try { localStorage.setItem(VIEW_KEY, JSON.stringify({ captions: showCaptions, accounts: showAccounts })); }
        catch { /* private mode */ }
    }, [showCaptions, showAccounts]);

    // Deep links (e.g. the studio's "posts without a video") preset filters:
    // ?video=with|without, ?published_on=tiktok|any, ?not_published_on=youtube|any
    useEffect(() => {
        if (!router.isReady) return;
        const v = router.query.video;
        if (v === "with" || v === "without") setVideoFilter(v);
        const okPlatform = (x) => x === "any" || !!PLATFORMS[x];
        if (okPlatform(router.query.published_on)) setPublishedOnFilter(router.query.published_on);
        if (okPlatform(router.query.not_published_on)) setNotPublishedOnFilter(router.query.not_published_on);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [router.isReady]);

    const filtersActive = search.trim() || statusFilter !== "all" || videoFilter !== "all"
        || dateFrom || dateTo || publishedOnFilter || notPublishedOnFilter;
    const clearFilters = () => {
        setSearch(""); setStatusFilter("all"); setVideoFilter("all");
        setDateFrom(""); setDateTo(""); setPublishedOnFilter(""); setNotPublishedOnFilter("");
    };

    useEffect(() => {
        if (!jwt) return;
        SocialAccountsEndpoints.list({ filters: { is_active: { $eq: true } }, sort: ['platform:asc'] })
            .then((res) => setAccounts(res.data || []))
            .catch((err) => console.error("Failed to load accounts", err));
        SocialRelayProvidersEndpoints.list({ filters: { is_active: { $eq: true } }, sort: ['createdAt:asc'] })
            .then((res) => setRelays(res.data || []))
            .catch((err) => console.error("Failed to load relay providers", err));
    }, [jwt]);

    const loadPosts = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const all = [];
            for (let p = 1; p <= MAX_PAGES; p++) {
                const res = await SocialPostsEndpoints.list({
                    status: 'draft',
                    sort: ['createdAt:desc'],
                    // social_accounts rides along for bulk edit: platform
                    // add/remove has to rewrite the linked accounts too.
                    populate: ['cover', 'media', 'video', 'products', 'social_accounts'],
                    pagination: { page: p, pageSize: FETCH_PAGE },
                });
                const rows = res.data || [];
                all.push(...rows);
                const pc = res.meta?.pagination?.pageCount || 1;
                if (p >= pc || rows.length < FETCH_PAGE) break;
            }
            let pubIds = new Set();
            try {
                const pub = await SocialPostsEndpoints.publishedMarker();
                pubIds = new Set((pub.data || []).map((x) => x.documentId));
            } catch { /* CMS column falls back to draft */ }
            setPosts(all.map((p) => ({ ...p, _isPublished: pubIds.has(p.documentId) })));
        } catch (err) {
            console.error("Failed to load posts", err);
            toast("Failed to load posts.", "danger");
        } finally {
            setLoading(false);
        }
    }, [jwt]);

    useEffect(() => { loadPosts(); }, [loadPosts]);

    // ── client-side filtering ───────────────────────────────
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const from = dateFrom ? new Date(dateFrom) : null;
        const to = dateTo ? new Date(`${dateTo}T23:59:59.999`) : null;
        const rows = posts.filter((p) => {
            if (q && !`${p.title || ""} ${p.body || ""}`.toLowerCase().includes(q)) return false;
            if (statusFilter !== "all" && (p.post_status || "draft") !== statusFilter) return false;
            if (videoFilter === "with" && !hasVideo(p)) return false;
            if (videoFilter === "without" && hasVideo(p)) return false;
            const created = p.createdAt ? new Date(p.createdAt) : null;
            if (from && (!created || created < from)) return false;
            if (to && (!created || created > to)) return false;
            if (publishedOnFilter) {
                if (publishedOnFilter === "any" ? !publishedAnywhere(p) : !publishedOn(p, publishedOnFilter)) return false;
            }
            if (notPublishedOnFilter) {
                if (notPublishedOnFilter === "any") {
                    if (publishedAnywhere(p)) return false;
                } else {
                    // "Not published on X" means posts that still OWE X a post —
                    // ones that target the platform but have no success there.
                    if (publishedOn(p, notPublishedOnFilter) || !targetsPlatform(p, notPublishedOnFilter)) return false;
                }
            }
            return true;
        });
        // Sorted here rather than in the query: the same reason the filters are
        // client-side — several of these rank on platform_results, which the API
        // cannot order by.
        const cmp = (SORTS[sortKey] || SORTS.newest).cmp;
        return rows.sort(cmp);
    }, [posts, search, statusFilter, videoFilter, dateFrom, dateTo, publishedOnFilter, notPublishedOnFilter, sortKey]);

    useEffect(() => { setPage(1); }, [search, statusFilter, videoFilter, dateFrom, dateTo, publishedOnFilter, notPublishedOnFilter, sortKey]);

    const pageCount = Math.max(1, Math.ceil(filtered.length / CARDS_PER_PAGE));
    const clampedPage = Math.min(page, pageCount);
    const pageItems = filtered.slice((clampedPage - 1) * CARDS_PER_PAGE, clampedPage * CARDS_PER_PAGE);
    const withoutVideoCount = useMemo(() => filtered.filter((p) => !hasVideo(p)).length, [filtered]);

    // ── selection ───────────────────────────────────────────
    const toggleSelected = (docId) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(docId)) next.delete(docId); else next.add(docId);
            return next;
        });
    };

    const filteredPostIds = filtered.map(p => p.documentId);
    const allSelected = filteredPostIds.length > 0 && filteredPostIds.every(id => selectedIds.has(id));
    const toggleSelectAll = () => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (allSelected) { filteredPostIds.forEach(id => next.delete(id)); } else { filteredPostIds.forEach(id => next.add(id)); }
            return next;
        });
    };
    const selectedCount = [...selectedIds].filter(id => filteredPostIds.includes(id)).length;

    // ── publish / unpublish / duplicate / delete ────────────
    const summarizeResult = (res) => {
        const r = res?.data || res || {};
        if (typeof r.successes === "number" && typeof r.attempted === "number") {
            return { ok: r.successes, fail: Math.max(0, r.attempted - r.successes), status: r.post_status };
        }
        return { ok: 1, fail: 0 };
    };

    const publishOne = async (docId) => {
        setPublishing(prev => ({ ...prev, [docId]: true }));
        try {
            const res = await SocialPostsEndpoints.publishSocial(docId);
            const { ok, fail } = summarizeResult(res);
            setPosts(prev => prev.map(p => p.documentId === docId ? { ...p, _isPublished: ok > 0 } : p));
            if (fail > 0 && ok > 0) toast(`Published to ${ok} platform(s), ${fail} failed.`, "warning");
            else if (ok > 0) toast(`Published to ${ok} platform(s)!`, "success");
            else toast("Publish failed on all platforms. Check the post's Publish Results.", "danger");
        } catch (err) {
            console.error("Failed to publish", err);
            toast(err?.response?.data?.error?.message || "Failed to publish.", "danger");
        } finally {
            setPublishing(prev => ({ ...prev, [docId]: false }));
        }
    };

    const unpublishOne = async (docId) => {
        setPublishing(prev => ({ ...prev, [docId]: true }));
        try {
            await SocialPostsEndpoints.unpublishSocial(docId);
            setPosts(prev => prev.map(p => p.documentId === docId ? { ...p, _isPublished: false } : p));
            toast("Removed from platforms.", "success");
        } catch (err) {
            console.error("Failed to unpublish", err);
            toast("Failed to unpublish.", "danger");
        } finally {
            setPublishing(prev => ({ ...prev, [docId]: false }));
        }
    };

    // ── relay push ──────────────────────────────────────────
    // relay = a specific provider row, or null for "all active relays". The
    // server intersects each relay's configured platforms with the post's own
    // platform selection, so this never posts wider than either choice.
    const pushViaRelay = async (docIds, relay) => {
        const ids = docIds.filter(Boolean);
        if (!ids.length) { toast("No items selected.", "warning"); return; }
        const name = relay ? relay.name : "all active relays";
        if (ids.length > 1 && !confirm(`Push ${ids.length} post(s) via ${name}?`)) return;
        let ok = 0, fail = 0, queued = 0;
        const notes = new Set();
        for (const docId of ids) {
            setPublishing(prev => ({ ...prev, [docId]: true }));
            try {
                const res = await SocialPostsEndpoints.publishRelay(docId, {
                    data: relay ? { relayIds: [relay.documentId] } : {},
                });
                const r = res?.data || res || {};
                ok += r.successes || 0; fail += r.failures || 0; queued += r.pending || 0;
                (r.skipped || []).forEach((s) => notes.add(`${s.relay}: ${s.reason}`));
                if ((r.successes || 0) + (r.pending || 0) > 0) {
                    setPosts(prev => prev.map(p => p.documentId === docId
                        ? { ...p, _isPublished: true, post_status: r.post_status || p.post_status, platform_results: r.platform_results || p.platform_results }
                        : p));
                }
            } catch (err) {
                fail += 1;
                console.error("Relay push failed", err);
                const msg = err?.response?.data?.error?.message;
                if (msg) notes.add(msg);
            } finally {
                setPublishing(prev => ({ ...prev, [docId]: false }));
            }
        }
        const detail = notes.size ? ` — ${[...notes].join("; ")}` : "";
        if (ok + queued > 0) {
            toast(`Relay: ${ok} platform post(s) live${queued ? `, ${queued} queued at the provider` : ""}${fail ? `, ${fail} failed` : ""}${detail}`, fail ? "warning" : "success");
        } else {
            toast(`Relay push failed${detail || " — check the Relays page"}`, "danger");
        }
    };

    const bulkPublish = async () => {
        const ids = [...selectedIds].filter(id => filteredPostIds.includes(id));
        if (ids.length === 0) { toast("No items selected.", "warning"); return; }
        if (!confirm(`Publish ${ids.length} post(s) to their connected platforms?`)) return;
        let ok = 0, fail = 0;
        for (const docId of ids) {
            setPublishing(prev => ({ ...prev, [docId]: true }));
            try { const res = await SocialPostsEndpoints.publishSocial(docId); const s = summarizeResult(res); if (s.ok > 0) { ok++; setPosts(prev => prev.map(p => p.documentId === docId ? { ...p, _isPublished: true } : p)); } else { fail++; } }
            catch { fail++; }
            finally { setPublishing(prev => ({ ...prev, [docId]: false })); }
        }
        toast(`Published ${ok} post(s)${fail ? `, ${fail} failed` : ""}.`, fail ? "warning" : "success");
        setSelectedIds(new Set());
    };

    const bulkUnpublish = async () => {
        const ids = [...selectedIds].filter(id => filteredPostIds.includes(id));
        if (ids.length === 0) { toast("No items selected.", "warning"); return; }
        if (!confirm(`Unpublish ${ids.length} post(s)?`)) return;
        let ok = 0, fail = 0;
        for (const docId of ids) {
            setPublishing(prev => ({ ...prev, [docId]: true }));
            try { await SocialPostsEndpoints.unpublishSocial(docId); ok++; setPosts(prev => prev.map(p => p.documentId === docId ? { ...p, _isPublished: false } : p)); }
            catch { fail++; }
            finally { setPublishing(prev => ({ ...prev, [docId]: false })); }
        }
        toast(`Unpublished ${ok} post(s)${fail ? `, ${fail} failed` : ""}.`, fail ? "warning" : "success");
        setSelectedIds(new Set());
    };

    // ── bulk edit ───────────────────────────────────────────
    // Platform add/remove is the headline: an account connected AFTER posts
    // were written (the "we added LinkedIn later" case) can be enabled across
    // the backlog in one pass. Publishing only targets linked social_accounts
    // whose platform is selected (see _resolveTargets server-side), so adding
    // a platform here also links its active account(s) — without that the
    // platform would sit in `missing` forever and never actually publish.
    const [bulkOpen, setBulkOpen] = useState(false);
    const [bulkPlatformOps, setBulkPlatformOps] = useState({}); // platform → 'add' | 'remove'
    const [bulkAddTags, setBulkAddTags] = useState("");
    const [bulkRemoveTags, setBulkRemoveTags] = useState("");
    const [bulkSchedule, setBulkSchedule] = useState("leave"); // leave | set | clear
    const [bulkScheduleAt, setBulkScheduleAt] = useState("");
    const [bulkProgress, setBulkProgress] = useState(null); // { done, total }

    const openBulkEdit = () => {
        setBulkPlatformOps({});
        setBulkAddTags(""); setBulkRemoveTags("");
        setBulkSchedule("leave"); setBulkScheduleAt("");
        setBulkProgress(null);
        setBulkOpen(true);
    };

    // Each click cycles a platform: leave → add → remove → leave.
    const cyclePlatformOp = (key) => setBulkPlatformOps((prev) => {
        const next = { ...prev };
        if (!next[key]) next[key] = "add";
        else if (next[key] === "add") next[key] = "remove";
        else delete next[key];
        return next;
    });

    const parseTagList = (s) => String(s || "").split(",").map((t) => t.trim()).filter(Boolean);

    const applyBulkEdit = async () => {
        const ids = [...selectedIds].filter(id => filteredPostIds.includes(id));
        if (!ids.length) { toast("No posts selected.", "warning"); return; }
        const adds = Object.keys(bulkPlatformOps).filter((k) => bulkPlatformOps[k] === "add");
        const removes = Object.keys(bulkPlatformOps).filter((k) => bulkPlatformOps[k] === "remove");
        const addTags = parseTagList(bulkAddTags);
        const removeTags = parseTagList(bulkRemoveTags);
        const scheduling = bulkSchedule === "set" ? !!bulkScheduleAt : bulkSchedule === "clear";
        if (!adds.length && !removes.length && !addTags.length && !removeTags.length && !scheduling) {
            toast("Nothing to change — pick a platform, tag, or schedule first.", "warning");
            return;
        }

        setBulkProgress({ done: 0, total: ids.length });
        let ok = 0, fail = 0;
        for (const docId of ids) {
            const post = posts.find((p) => p.documentId === docId);
            if (!post) { fail++; continue; }
            const data = {};
            if (adds.length || removes.length) {
                const cur = Array.isArray(post.platforms) ? post.platforms : [];
                data.platforms = [...new Set([...cur, ...adds])].filter((p) => !removes.includes(p));
                // Accounts follow platforms: an added platform brings its
                // active account(s) with it, a removed one takes its own away.
                const curAccounts = Array.isArray(post.social_accounts) ? post.social_accounts : [];
                const kept = curAccounts.filter((a) => !removes.includes(a.platform)).map((a) => a.id);
                const linked = accounts.filter((a) => adds.includes(a.platform)).map((a) => a.id);
                data.social_accounts = [...new Set([...kept, ...linked])];
            }
            if (addTags.length || removeTags.length) {
                const cur = Array.isArray(post.tags) ? post.tags : [];
                const gone = new Set(removeTags.map((t) => t.toLowerCase()));
                const next = cur.filter((t) => !gone.has(String(t).toLowerCase()));
                for (const t of addTags) {
                    if (!next.some((x) => String(x).toLowerCase() === t.toLowerCase())) next.push(t);
                }
                data.tags = next;
            }
            if (bulkSchedule === "set" && bulkScheduleAt) {
                data.scheduled_at = new Date(bulkScheduleAt).toISOString();
                // Same rule as the editor: a schedule promotes draft → scheduled,
                // but never touches the publish-flow states.
                if ((post.post_status || "draft") === "draft") data.post_status = "scheduled";
            } else if (bulkSchedule === "clear") {
                data.scheduled_at = null;
                if (post.post_status === "scheduled") data.post_status = "draft";
            }
            try { await SocialPostsEndpoints.updateDraft(docId, { data }); ok++; }
            catch (err) { console.error(`Bulk edit failed for ${docId}`, err); fail++; }
            setBulkProgress((prev) => ({ ...prev, done: (prev?.done || 0) + 1 }));
        }

        setBulkProgress(null);
        setBulkOpen(false);
        toast(
            `Updated ${ok} post(s)${fail ? `, ${fail} failed` : ""}.`
            + (adds.length && ok ? " Use Publish on the same selection to push the new platform(s) out." : ""),
            fail ? "warning" : "success",
        );
        // Selection is kept on purpose — the natural next step is Publish (N).
        await loadPosts();
    };

    const handleDelete = async (post) => {
        if (!confirm(`Delete post "${post.title}"?`)) return;
        try {
            await SocialPostsEndpoints.del(post.documentId);
            setPosts(prev => prev.filter(p => p.documentId !== post.documentId));
            toast("Post deleted.", "success");
        } catch (err) {
            console.error("Failed to delete post", err);
            toast("Failed to delete post.", "danger");
        }
    };

    const duplicateOne = async (post) => {
        try {
            const res = await SocialPostsEndpoints.duplicate(post.documentId);
            const newId = (res?.data || res)?.documentId;
            toast("Copied to a new draft — review & publish to repost.", "success");
            if (newId) router.push(`/posts/${newId}`);
            else await loadPosts();
        } catch (err) {
            console.error("Failed to duplicate post", err);
            toast("Failed to duplicate.", "danger");
        }
    };

    // Everything is already in memory, so "Export All" is just the filtered list.
    const fetchAllPosts = useCallback(async () => filtered, [filtered]);

    return (
        <ProtectedRoute>
            <Layout fullWidth>
                <ToastContainer />
                <div className="d-flex align-items-center flex-wrap gap-2 mb-3">
                    <h3 className="mb-0"><i className="fas fa-paper-plane me-2"></i>Posts</h3>
                    <span className="badge bg-secondary align-self-center">
                        {filtersActive ? `${filtered.length} of ${posts.length}` : `${posts.length}`} posts
                    </span>
                    {withoutVideoCount > 0 && (
                        <span className="badge bg-warning text-dark align-self-center">{withoutVideoCount} without a video</span>
                    )}
                    <div className="ms-auto d-flex gap-2 align-items-center flex-wrap">
                        {selectedCount > 0 && (
                            <>
                                <button className="btn btn-warning btn-sm" onClick={openBulkEdit}
                                    title="Change platforms, tags, or schedule on every selected post">
                                    <i className="fas fa-pen-to-square me-1"></i>Bulk edit ({selectedCount})
                                </button>
                                <button className="btn btn-success btn-sm" onClick={bulkPublish}>
                                    <i className="fas fa-upload me-1"></i>Publish ({selectedCount})
                                </button>
                                <RelayPushButton relays={relays} count={selectedCount}
                                    onPick={(relay) => pushViaRelay([...selectedIds].filter(id => filteredPostIds.includes(id)), relay)} />
                                <button className="btn btn-outline-secondary btn-sm" onClick={bulkUnpublish}>
                                    <i className="fas fa-eye-slash me-1"></i>Unpublish ({selectedCount})
                                </button>
                            </>
                        )}
                        <ExcelIO
                            entityLabel="Social Posts"
                            contentType="api::social-post.social-post"
                            columns={POST_EXCEL_COLUMNS}
                            rows={filtered}
                            selectedIds={selectedIds}
                            total={filtered.length}
                            fetchAll={fetchAllPosts}
                            onAfterImport={loadPosts}
                        />
                        <Link className="btn btn-success btn-sm" href="/posts/from-product" title="Turn a product into a shoppable post">
                            <i className="fas fa-tags me-1"></i>Sell a Product
                        </Link>
                        <Link className="btn btn-primary btn-sm" href="/posts/create">
                            <i className="fas fa-plus me-1"></i>New Post
                        </Link>
                        <button className="btn btn-sm btn-outline-secondary" onClick={loadPosts} disabled={loading} title="Refresh">
                            <i className={`fas fa-sync-alt ${loading ? "fa-spin" : ""}`}></i>
                        </button>
                    </div>
                </div>

                {/* ── filters ── */}
                <div className="card mb-3">
                    <div className="card-body py-2 d-flex flex-wrap align-items-center gap-2">
                        <div className="input-group input-group-sm" style={{ maxWidth: 280 }}>
                            <span className="input-group-text"><i className="fas fa-search"></i></span>
                            <input className="form-control" placeholder="Search posts…" value={search}
                                onChange={(e) => setSearch(e.target.value)} />
                        </div>
                        <select className="form-select form-select-sm" style={{ width: "auto" }} value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)} title="Post status">
                            <option value="all">All statuses</option>
                            <option value="draft">Draft</option>
                            <option value="scheduled">Scheduled</option>
                            <option value="publishing">Publishing</option>
                            <option value="published">Published</option>
                            <option value="partially_published">Partially published</option>
                            <option value="failed">Failed</option>
                        </select>
                        <select className="form-select form-select-sm" style={{ width: "auto" }} value={videoFilter}
                            onChange={(e) => setVideoFilter(e.target.value)} title="Video">
                            <option value="all">With & without video</option>
                            <option value="with">With video</option>
                            <option value="without">Without video</option>
                        </select>
                        <div className="input-group input-group-sm" style={{ width: "auto" }} title="Sort">
                            <span className="input-group-text"><i className="fas fa-arrow-down-wide-short"></i></span>
                            <select className="form-select form-select-sm" style={{ width: "auto" }} value={sortKey}
                                onChange={(e) => setSortKey(e.target.value)}>
                                {Object.entries(SORTS).map(([key, s]) => (
                                    <option key={key} value={key}>{s.label}</option>
                                ))}
                            </select>
                        </div>
                        <select className={`form-select form-select-sm ${publishedOnFilter ? "border-success" : ""}`}
                            style={{ width: "auto" }} value={publishedOnFilter}
                            onChange={(e) => setPublishedOnFilter(e.target.value)}
                            title="Only posts already published on…">
                            <option value="">Published on…</option>
                            <option value="any">Published anywhere</option>
                            {Object.entries(PLATFORMS).map(([key, p]) => (
                                <option key={key} value={key}>Published on {p.label}</option>
                            ))}
                        </select>
                        <select className={`form-select form-select-sm ${notPublishedOnFilter ? "border-danger" : ""}`}
                            style={{ width: "auto" }} value={notPublishedOnFilter}
                            onChange={(e) => setNotPublishedOnFilter(e.target.value)}
                            title="Only posts that still owe a platform a post">
                            <option value="">Not published on…</option>
                            <option value="any">Not published anywhere</option>
                            {Object.entries(PLATFORMS).map(([key, p]) => (
                                <option key={key} value={key}>Not on {p.label}</option>
                            ))}
                        </select>
                        <div className="input-group input-group-sm" style={{ width: "auto" }} title="Created between">
                            <span className="input-group-text"><i className="fas fa-calendar"></i></span>
                            <input type="date" className="form-control" value={dateFrom} max={dateTo || undefined}
                                onChange={(e) => setDateFrom(e.target.value)} />
                            <span className="input-group-text">→</span>
                            <input type="date" className="form-control" value={dateTo} min={dateFrom || undefined}
                                onChange={(e) => setDateTo(e.target.value)} />
                        </div>
                        <div className="form-check mb-0 ms-1">
                            <input className="form-check-input" type="checkbox" id="select-all"
                                checked={allSelected} onChange={toggleSelectAll} disabled={!filtered.length} />
                            <label className="form-check-label small" htmlFor="select-all">Select all</label>
                        </div>
                        {/* What the cards show. Flipping either clears the per-card
                            toggles, so the switch always describes the whole grid. */}
                        <div className="btn-group btn-group-sm" role="group" aria-label="Card layout">
                            <button type="button"
                                className={`btn ${showCaptions ? "btn-secondary" : "btn-outline-secondary"}`}
                                title={showCaptions ? "Hide captions on every card" : "Show captions on every card"}
                                onClick={() => { setShowCaptions((v) => !v); setCaptionFlips(new Set()); }}>
                                <i className="fas fa-align-left me-1"></i>Captions
                            </button>
                            <button type="button"
                                className={`btn ${showAccounts ? "btn-secondary" : "btn-outline-secondary"}`}
                                title={showAccounts ? "Collapse the accounts on every card" : "Expand the accounts on every card"}
                                onClick={() => { setShowAccounts((v) => !v); setAccountFlips(new Set()); }}>
                                <i className="fas fa-share-nodes me-1"></i>Accounts
                            </button>
                        </div>
                        {filtersActive && (
                            <button className="btn btn-sm btn-link p-0" onClick={clearFilters}>Clear filters</button>
                        )}
                        {loading && <span className="spinner-border spinner-border-sm ms-auto"></span>}
                    </div>
                </div>

                {loading && posts.length === 0 ? (
                    <div className="text-center py-5"><div className="spinner-border"></div></div>
                ) : filtered.length === 0 ? (
                    <div className="alert alert-info">
                        {posts.length === 0 ? "No posts yet. Create your first post!" : "No posts match the current filters."}
                    </div>
                ) : (
                    <>
                        <div className="row g-3">
                            {pageItems.map((post) => {
                                const imgs = imageItems(post);
                                const thumb = post.cover || imgs[0];
                                const withVideo = hasVideo(post);
                                const busy = publishing[post.documentId];
                                const checked = selectedIds.has(post.documentId);
                                return (
                                    <div key={post.documentId} className="col-sm-6 col-md-4 col-xl-3 col-xxl-2">
                                        <div className={`card h-100 shadow-sm ${checked ? "border-primary" : "border-0"}`}>
                                            <div className="position-relative">
                                                <Link href={`/posts/${post.documentId}`} className="bg-light d-flex align-items-center justify-content-center"
                                                    style={{ height: 140, overflow: "hidden", borderRadius: "6px 6px 0 0" }}>
                                                    {thumb ? (
                                                        <img src={MediaUtilsEndpoints.strapiImageUrl(thumb.formats?.small || thumb.formats?.thumbnail || thumb)} alt=""
                                                            style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                                    ) : (
                                                        <i className="fas fa-image fa-2x text-muted"></i>
                                                    )}
                                                </Link>
                                                <input type="checkbox" className="form-check-input position-absolute"
                                                    style={{ top: 8, left: 8, zIndex: 2 }}
                                                    checked={checked} onChange={() => toggleSelected(post.documentId)} />
                                                <div className="position-absolute d-flex gap-1" style={{ top: 8, right: 8, zIndex: 2 }}>
                                                    {withVideo && (
                                                        <span className="badge bg-dark" title="Has a video"><i className="fas fa-film"></i></span>
                                                    )}
                                                    <span className={`badge ${post._isPublished ? "bg-success" : "bg-secondary"}`}
                                                        title={`CMS: ${post._isPublished ? "published" : "draft"}`}>
                                                        {post._isPublished ? "Live" : "Draft"}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="card-body p-2">
                                                <Link href={`/posts/${post.documentId}`} className="text-decoration-none fw-semibold d-block text-truncate"
                                                    style={{ fontSize: 13 }} title={post.title}>
                                                    {post.title || "(untitled)"}
                                                </Link>
                                                <div className="text-muted d-flex align-items-center gap-2 flex-wrap" style={{ fontSize: 11 }}>
                                                    <span className={`badge ${POST_STATUS_BADGES[post.post_status] || "bg-secondary"}`}>
                                                        {(post.post_status || "draft").replace("_", " ")}
                                                    </span>
                                                    <span>{post.createdAt ? new Date(post.createdAt).toLocaleDateString() : ""}</span>
                                                    {imgs.length > 0 && <span><i className="fas fa-image"></i> {imgs.length}</span>}
                                                    {(post.products || []).length > 0 && (
                                                        <span title="Linked products"><i className="fas fa-box"></i> {post.products.length}</span>
                                                    )}
                                                    {post.body && (
                                                        <button type="button"
                                                            className={`btn btn-sm p-0 border-0 bg-transparent ms-auto ${captionOpen(post.documentId) ? "text-primary" : "text-muted"}`}
                                                            style={{ fontSize: 11 }}
                                                            title={captionOpen(post.documentId) ? "Hide the caption" : "Show the caption"}
                                                            onClick={() => flipCaption(post.documentId)}>
                                                            <i className="fas fa-align-left"></i>
                                                        </button>
                                                    )}
                                                </div>

                                                {/* The caption is what actually goes out; on a card it reads as
                                                    three lines with the rest a click away on the post itself. */}
                                                {captionOpen(post.documentId) && post.body && (
                                                    <p className="text-muted mb-0 mt-1" title={post.body}
                                                        style={{
                                                            fontSize: 11, whiteSpace: "pre-wrap", overflow: "hidden",
                                                            display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical",
                                                        }}>
                                                        {post.body}
                                                    </p>
                                                )}

                                                <div className="mt-1">
                                                    <AccountFlags post={post} accounts={accounts}
                                                        collapsed={!accountsOpen(post.documentId)}
                                                        onToggle={() => flipAccounts(post.documentId)} />
                                                </div>
                                            </div>
                                            <div className="card-footer p-1 d-flex gap-1 justify-content-center flex-wrap">
                                                <Link className="btn btn-sm btn-outline-primary" href={`/posts/${post.documentId}`} title="Edit the post">
                                                    <i className="fas fa-pen"></i>
                                                </Link>
                                                {imgs.length > 0 && (
                                                    <Link className={`btn btn-sm ${withVideo ? "btn-outline-secondary" : "btn-outline-warning"}`}
                                                        href={`/posts/video-studio?post=${post.documentId}`}
                                                        title={withVideo ? "Edit / re-render this post's video" : "Make a video from this post's images"}>
                                                        <i className="fas fa-film"></i>
                                                    </Link>
                                                )}
                                                {post._isPublished ? (
                                                    <button className="btn btn-sm btn-outline-secondary" onClick={() => unpublishOne(post.documentId)}
                                                        disabled={busy} title="Unpublish from the platforms">
                                                        {busy ? <span className="spinner-border spinner-border-sm"></span> : <i className="fas fa-eye-slash"></i>}
                                                    </button>
                                                ) : (
                                                    <button className="btn btn-sm btn-outline-success" onClick={() => publishOne(post.documentId)}
                                                        disabled={busy} title="Publish to the connected platforms">
                                                        {busy ? <span className="spinner-border spinner-border-sm"></span> : <i className="fas fa-upload"></i>}
                                                    </button>
                                                )}
                                                <RelayPushButton relays={relays} count={1} iconOnly dropUp disabled={busy}
                                                    onPick={(relay) => pushViaRelay([post.documentId], relay)} />
                                                <button className="btn btn-sm btn-outline-primary" onClick={() => duplicateOne(post)} title="Repost — copy to a new draft">
                                                    <i className="fas fa-copy"></i>
                                                </button>
                                                <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(post)} title="Delete">
                                                    <i className="fas fa-trash"></i>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {pageCount > 1 && (
                            <nav className="mt-3">
                                <ul className="pagination pagination-sm justify-content-center">
                                    <li className={`page-item ${clampedPage <= 1 ? "disabled" : ""}`}>
                                        <button className="page-link" onClick={() => setPage(clampedPage - 1)}>Prev</button>
                                    </li>
                                    {Array.from({ length: Math.min(pageCount, 9) }, (_, i) => {
                                        let p;
                                        if (pageCount <= 9) p = i + 1;
                                        else if (clampedPage <= 5) p = i + 1;
                                        else if (clampedPage >= pageCount - 4) p = pageCount - 8 + i;
                                        else p = clampedPage - 4 + i;
                                        return (
                                            <li key={p} className={`page-item ${p === clampedPage ? "active" : ""}`}>
                                                <button className="page-link" onClick={() => setPage(p)}>{p}</button>
                                            </li>
                                        );
                                    })}
                                    <li className={`page-item ${clampedPage >= pageCount ? "disabled" : ""}`}>
                                        <button className="page-link" onClick={() => setPage(clampedPage + 1)}>Next</button>
                                    </li>
                                </ul>
                            </nav>
                        )}
                    </>
                )}

                {/* ── bulk edit modal ── */}
                {bulkOpen && (
                    <div className="modal d-block" tabIndex={-1} style={{ background: "rgba(0,0,0,0.5)", zIndex: 9999 }}>
                        <div className="modal-dialog modal-lg">
                            <div className="modal-content">
                                <div className="modal-header py-2">
                                    <h5 className="modal-title">
                                        <i className="fas fa-pen-to-square me-2"></i>Bulk edit {selectedCount} post{selectedCount === 1 ? "" : "s"}
                                    </h5>
                                    <button type="button" className="btn-close" onClick={() => setBulkOpen(false)} disabled={!!bulkProgress}></button>
                                </div>
                                <div className="modal-body">
                                    <label className="form-label small fw-semibold mb-1">Platforms</label>
                                    <p className="text-muted small mb-2">
                                        Click a platform to cycle: leave as is → <span className="text-success">add</span> → <span className="text-danger">remove</span>.
                                        Adding a platform also links its active account(s) to each post — publishing only
                                        targets linked accounts, so a platform without its account would never go out.
                                    </p>
                                    <div className="d-flex flex-wrap gap-2 mb-1">
                                        {Object.entries(PLATFORMS).map(([key, p]) => {
                                            const op = bulkPlatformOps[key];
                                            const activeCount = accounts.filter((a) => a.platform === key).length;
                                            return (
                                                <button key={key} type="button" disabled={!!bulkProgress}
                                                    className={`btn btn-sm ${op === "add" ? "btn-success" : op === "remove" ? "btn-danger" : "btn-outline-secondary"}`}
                                                    onClick={() => cyclePlatformOp(key)}
                                                    title={`${p.label} — ${activeCount} active account${activeCount === 1 ? "" : "s"}`}>
                                                    <i className={`${p.icon} me-1`}></i>{p.label}
                                                    {op === "add" && <i className="fas fa-plus ms-1"></i>}
                                                    {op === "remove" && <i className="fas fa-minus ms-1"></i>}
                                                    {op === "add" && activeCount === 0 && <i className="fas fa-triangle-exclamation ms-1" title="No active account connected — the platform will be selected but cannot publish until one is"></i>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {Object.keys(bulkPlatformOps).length > 0 && (
                                        <p className="small mb-3">
                                            {Object.entries(bulkPlatformOps).filter(([, v]) => v === "add").length > 0 && (
                                                <span className="text-success me-3">
                                                    Add: {Object.keys(bulkPlatformOps).filter((k) => bulkPlatformOps[k] === "add").map((k) => PLATFORMS[k]?.label || k).join(", ")}
                                                </span>
                                            )}
                                            {Object.entries(bulkPlatformOps).filter(([, v]) => v === "remove").length > 0 && (
                                                <span className="text-danger">
                                                    Remove: {Object.keys(bulkPlatformOps).filter((k) => bulkPlatformOps[k] === "remove").map((k) => PLATFORMS[k]?.label || k).join(", ")}
                                                </span>
                                            )}
                                        </p>
                                    )}

                                    <div className="row g-2 mb-3">
                                        <div className="col-md-6">
                                            <label className="form-label small fw-semibold mb-1">Add tags</label>
                                            <input className="form-control form-control-sm" placeholder="summer, sale" disabled={!!bulkProgress}
                                                value={bulkAddTags} onChange={(e) => setBulkAddTags(e.target.value)} />
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label small fw-semibold mb-1">Remove tags</label>
                                            <input className="form-control form-control-sm" placeholder="draft, old" disabled={!!bulkProgress}
                                                value={bulkRemoveTags} onChange={(e) => setBulkRemoveTags(e.target.value)} />
                                        </div>
                                    </div>

                                    <label className="form-label small fw-semibold mb-1">Schedule</label>
                                    <div className="d-flex flex-wrap align-items-center gap-2">
                                        <select className="form-select form-select-sm" style={{ width: "auto" }} disabled={!!bulkProgress}
                                            value={bulkSchedule} onChange={(e) => setBulkSchedule(e.target.value)}>
                                            <option value="leave">Leave as is</option>
                                            <option value="set">Set schedule</option>
                                            <option value="clear">Clear schedule</option>
                                        </select>
                                        {bulkSchedule === "set" && (
                                            <input type="datetime-local" className="form-control form-control-sm" style={{ width: "auto" }}
                                                value={bulkScheduleAt} onChange={(e) => setBulkScheduleAt(e.target.value)} disabled={!!bulkProgress} />
                                        )}
                                        {bulkSchedule === "set" && (
                                            <span className="text-muted small">Drafts become scheduled; publish-flow states are left alone.</span>
                                        )}
                                        {bulkSchedule === "clear" && (
                                            <span className="text-muted small">Scheduled posts go back to draft.</span>
                                        )}
                                    </div>

                                    {bulkProgress && (
                                        <div className="mt-3">
                                            <div className="progress" style={{ height: 8 }}>
                                                <div className="progress-bar progress-bar-striped progress-bar-animated"
                                                    style={{ width: `${(bulkProgress.done / bulkProgress.total) * 100}%` }}></div>
                                            </div>
                                            <small className="text-muted">{bulkProgress.done}/{bulkProgress.total} updated…</small>
                                        </div>
                                    )}
                                </div>
                                <div className="modal-footer py-2">
                                    <span className="me-auto text-muted small">
                                        Changes are saved to each post's draft — hit Publish on the same selection to push them live.
                                    </span>
                                    <button className="btn btn-secondary btn-sm" onClick={() => setBulkOpen(false)} disabled={!!bulkProgress}>Cancel</button>
                                    <button className="btn btn-warning btn-sm" onClick={applyBulkEdit} disabled={!!bulkProgress}>
                                        {bulkProgress ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="fas fa-check me-1"></i>}
                                        Apply to {selectedCount} post{selectedCount === 1 ? "" : "s"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}
