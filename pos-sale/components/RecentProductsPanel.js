import { useEffect, useState } from 'react';
import { useUtil } from '@rutba/pos-shared/context/UtilContext';
import SaleApi from '@rutba/pos-shared/lib/saleApi';
import { StraipImageUrl, isImage } from '@rutba/api-provider/lib/api';

// Stock-item → best thumbnail URL. Mirrors the resolver in
// sales-items-form so the same image follows the product into the
// Quick-add tiles. Prefer the explicit `logo`, fall back to gallery.
function productThumbUrl(product) {
    if (!product) return null;
    const pick = (file) => {
        if (!file || !isImage(file)) return null;
        const thumb = file.formats?.thumbnail || file;
        return StraipImageUrl(thumb);
    };
    return pick(product.logo)
        || pick(Array.isArray(product.gallery) ? product.gallery.find(isImage) : null);
}

/** Compact abbreviation for the no-image fallback on icon tiles.
 *
 *   "Plastic Bag"         → "PB"
 *   "Mariab B 2p MB3p"    → "MB2MB" (first char of first ≤5 words, digits kept)
 *   "Coca-Cola"           → "COCA-"
 *   "Shampoo"             → "SHAMP"
 *   "Pepsi 250ml"         → "P2"
 *
 * Capped at 5 chars to fit in a 40×40 tile.
 */
function abbreviateName(name) {
    if (!name) return '';
    const s = String(name).trim();
    if (!s) return '';
    const words = s.split(/\s+/).slice(0, 5);
    if (words.length === 1) return words[0].slice(0, 5).toUpperCase();
    return words.map(w => w.charAt(0)).join('').toUpperCase().slice(0, 5);
}

const MAX_RECENT = 8;     // cap the auto-tracked list short so tellers see only what's actually fresh
const MAX_PINNED = 12;    // pinned items stay until the teller removes them — slightly bigger headroom

function recentKey(branch, desk) {
    return `pos.recentProducts.${branch?.id || branch?.documentId || 'no-branch'}.${desk?.id || 'no-desk'}`;
}
function pinnedKey(branch, desk) {
    return `pos.pinnedProducts.${branch?.id || branch?.documentId || 'no-branch'}.${desk?.id || 'no-desk'}`;
}

function loadList(key) {
    try {
        const raw = localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
}
function saveList(key, items) {
    try { localStorage.setItem(key, JSON.stringify(items)); } catch { /* quota — silent */ }
}

function entryKeyOf(entry) {
    return entry.productId || entry.name;
}

const PINNED_CHANGED_EVENT = 'pos.pinnedChanged';

/** Build a pinnable entry from a search-result row. The shape matches
 *  what the panel stores — name, productId, price, thumb. */
function entryFromStockItem(stockItem) {
    if (!stockItem) return null;
    const name = stockItem.product?.name || stockItem.name;
    if (!name) return null;
    return {
        name,
        productId: stockItem.product?.documentId || stockItem.product?.id || null,
        price: Number(stockItem.selling_price || 0),
        thumb: productThumbUrl(stockItem.product),
    };
}

/** Is this product currently pinned on this (branch, desk)? */
export function isProductPinned(branch, desk, stockItem) {
    const entry = entryFromStockItem(stockItem);
    if (!entry) return false;
    const list = loadList(pinnedKey(branch, desk));
    const key = entryKeyOf(entry);
    return list.some(p => entryKeyOf(p) === key);
}

/** Pin / unpin a product from any caller (e.g. search dropdown). The
 *  panel listens for `pos.pinnedChanged` and refreshes — no parent
 *  needs to coordinate the state. */
export function togglePinForStockItem(branch, desk, stockItem) {
    const entry = entryFromStockItem(stockItem);
    if (!entry) return false;
    const key = pinnedKey(branch, desk);
    const current = loadList(key);
    const k = entryKeyOf(entry);
    const isPinned = current.some(p => entryKeyOf(p) === k);
    const next = isPinned
        ? current.filter(p => entryKeyOf(p) !== k)
        : [entry, ...current.filter(p => entryKeyOf(p) !== k)].slice(0, MAX_PINNED);
    saveList(key, next);
    try {
        window.dispatchEvent(new CustomEvent(PINNED_CHANGED_EVENT, {
            detail: { branchKey: branch?.id || branch?.documentId, deskKey: desk?.id },
        }));
    } catch { /* no DOM in SSR — silent */ }
    return !isPinned;
}

/**
 * Quick-add sidebar for the cash teller. Two short lists:
 *   • Pinned — items the teller marked as favourites. Stays put until
 *     unpinned. Top of the panel because these are the fast-movers the
 *     teller chose to keep close.
 *   • Recent — last few items automatically added on this desk. Capped
 *     short so it stays focused on the current shift's pattern.
 *
 * Both lists live in localStorage scoped to (branch, desk) so each till
 * has its own tile set. Click → search → add the first available stock
 * item; if everything's been added or is out of stock, surface that
 * inline instead of silently failing.
 */
const COLLAPSED_KEY = 'pos.quickAdd.collapsed';

export default function RecentProductsPanel({ disabled, usedStockIds, onAddStockItem }) {
    const { branch, desk, currency } = useUtil();
    const [recent, setRecent] = useState(() => loadList(recentKey(branch, desk)));
    const [pinned, setPinned] = useState(() => loadList(pinnedKey(branch, desk)));
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);
    // Right-rail collapse: default to narrow icon-only column to save
    // screen real estate; teller can expand for full tile view. State is
    // device-local (not per-desk) — it's a UI preference, not a workflow.
    const [collapsed, setCollapsed] = useState(() => {
        try { return localStorage.getItem(COLLAPSED_KEY) !== '0'; } catch { return true; }
    });
    const setCollapsedPersist = (v) => {
        setCollapsed(v);
        try { localStorage.setItem(COLLAPSED_KEY, v ? '1' : '0'); } catch { /* silent */ }
    };

    useEffect(() => {
        setRecent(loadList(recentKey(branch, desk)));
        setPinned(loadList(pinnedKey(branch, desk)));
    }, [branch?.id, branch?.documentId, desk?.id]);

    // Listen for pin changes triggered elsewhere (e.g. the search dropdown
    // calling togglePinForStockItem). localStorage events don't fire in the
    // same tab, so we route through a custom DOM event.
    useEffect(() => {
        const handler = () => {
            setPinned(loadList(pinnedKey(branch, desk)));
            setRecent(loadList(recentKey(branch, desk)));
        };
        window.addEventListener(PINNED_CHANGED_EVENT, handler);
        return () => window.removeEventListener(PINNED_CHANGED_EVENT, handler);
    }, [branch?.id, branch?.documentId, desk?.id]);

    const pinnedKeys = new Set(pinned.map(entryKeyOf));

    const handlePick = async (entry) => {
        if (disabled || busy) return;
        setBusy(entryKeyOf(entry));
        setError(null);
        try {
            const results = await SaleApi.searchStockItemsByNameOrBarcode(entry.name);
            const match = results.find(r => (r.product?.documentId || r.product?.id) === entry.productId)
                || results.find(r => r.product?.name === entry.name)
                || results[0];
            if (!match) { setError(`No stock left for ${entry.name}`); return; }
            const candidates = [match, ...(match.more || [])];
            const available = candidates.find(si => si?.documentId && !usedStockIds.has(si.documentId));
            if (!available) { setError(`${entry.name} — none available`); return; }
            onAddStockItem(available);
        } catch (err) {
            console.error('Quick-add failed', err);
            setError('Failed to add');
        } finally {
            setBusy(null);
        }
    };

    const togglePin = (entry, e) => {
        e?.stopPropagation();
        const k = entryKeyOf(entry);
        const key = pinnedKey(branch, desk);
        const next = pinnedKeys.has(k)
            ? pinned.filter(p => entryKeyOf(p) !== k)
            : [entry, ...pinned.filter(p => entryKeyOf(p) !== k)].slice(0, MAX_PINNED);
        setPinned(next);
        saveList(key, next);
        // Mirror the cross-component contract so anyone else listening
        // (e.g. another widget showing pinned state) refreshes too.
        try {
            window.dispatchEvent(new CustomEvent(PINNED_CHANGED_EVENT, {
                detail: { branchKey: branch?.id || branch?.documentId, deskKey: desk?.id },
            }));
        } catch { /* SSR — silent */ }
    };

    const clearRecent = () => {
        if (!confirm('Clear recent products for this desk?')) return;
        setRecent([]);
        saveList(recentKey(branch, desk), []);
    };

    // Recent display = auto-tracked list, but hide entries already in Pinned
    // so the two sections don't double-show the same product.
    const recentVisible = recent.filter(r => !pinnedKeys.has(entryKeyOf(r)));

    /** Narrow icon-only tile for collapsed mode — just the thumb, tooltip
     *  carries the full name + price so tellers can hover before clicking. */
    const renderIconTile = (entry) => {
        const key = entryKeyOf(entry);
        const isBusy = busy === key;
        const isPinned = pinnedKeys.has(key);
        return (
            <button
                type="button"
                key={`icon-${key}`}
                className="btn btn-sm btn-light p-1 position-relative"
                disabled={disabled || isBusy}
                onClick={() => handlePick(entry)}
                title={`${entry.name}${entry.price != null ? ` — ${currency}${Number(entry.price).toFixed(2)}` : ''}`}
                style={{ width: 40, height: 40, lineHeight: 0 }}
            >
                {isBusy ? (
                    <span className="spinner-border spinner-border-sm" />
                ) : entry.thumb ? (
                    <img
                        src={entry.thumb}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 2 }}
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                ) : (
                    <span
                        style={{
                            fontSize: 9,
                            fontWeight: 700,
                            color: '#666',
                            letterSpacing: -0.2,
                            lineHeight: 1,
                            display: 'block',
                            wordBreak: 'break-all',
                        }}
                    >
                        {abbreviateName(entry.name)}
                    </span>
                )}
                {isPinned && (
                    <i
                        className="fas fa-thumbtack position-absolute text-warning"
                        style={{ top: -2, right: -2, fontSize: 8, background: '#fff', borderRadius: '50%', padding: 1 }}
                    />
                )}
            </button>
        );
    };

    const renderTile = (entry, { showUnpin = false } = {}) => {
        const key = entryKeyOf(entry);
        const isBusy = busy === key;
        const isPinned = pinnedKeys.has(key);
        return (
            <div key={`${key}`} className="position-relative">
                <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary text-start w-100 pe-4 d-flex align-items-center gap-2"
                    disabled={disabled || isBusy}
                    onClick={() => handlePick(entry)}
                    style={{ fontSize: 12, lineHeight: 1.2, whiteSpace: 'normal' }}
                    title={entry.name}
                >
                    {isBusy ? (
                        <span className="spinner-border spinner-border-sm" />
                    ) : (
                        <span
                            className="d-flex align-items-center justify-content-center bg-white border rounded"
                            style={{ width: 28, height: 28, flexShrink: 0, overflow: 'hidden' }}
                        >
                            {entry.thumb ? (
                                <img
                                    src={entry.thumb}
                                    alt=""
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                />
                            ) : (
                                <i className="fas fa-box text-muted" style={{ fontSize: 10, opacity: 0.4 }}></i>
                            )}
                        </span>
                    )}
                    <span className="flex-grow-1" style={{ minWidth: 0 }}>
                        <span className="d-block text-truncate">{entry.name}</span>
                        {entry.price != null && (
                            <small className="text-muted">
                                {currency}{Number(entry.price || 0).toFixed(2)}
                            </small>
                        )}
                    </span>
                </button>
                <button
                    type="button"
                    className="btn btn-link btn-sm position-absolute end-0 top-0 p-1 text-muted"
                    title={isPinned ? 'Unpin' : 'Pin'}
                    onClick={(e) => togglePin(entry, e)}
                    style={{ lineHeight: 1 }}
                >
                    <i className={`fas ${isPinned ? 'fa-thumbtack text-warning' : 'fa-thumbtack'}`}
                        style={{ fontSize: 10, opacity: isPinned ? 1 : 0.4, transform: isPinned ? 'none' : 'rotate(45deg)' }} />
                </button>
            </div>
        );
    };

    const isEmpty = pinned.length === 0 && recentVisible.length === 0;

    return (
        <div
            className="card border-start-0 rounded-0"
            style={{
                width: collapsed ? 56 : 220,
                position: 'sticky',
                top: 0,
                height: '100vh',
                transition: 'width 120ms ease',
                flexShrink: 0,
            }}
        >
            <div className="card-header py-2 d-flex justify-content-between align-items-center bg-light" style={{ minHeight: 38 }}>
                {!collapsed && (
                    <span className="small text-muted">
                        <i className="fas fa-bolt me-1"></i>Quick add
                    </span>
                )}
                <div className="d-flex align-items-center gap-1 ms-auto">
                    {!collapsed && recent.length > 0 && (
                        <button
                            type="button"
                            className="btn btn-sm btn-link text-muted p-0"
                            title="Clear recent"
                            onClick={clearRecent}
                            style={{ lineHeight: 1 }}
                        >
                            <i className="fas fa-times"></i>
                        </button>
                    )}
                    <button
                        type="button"
                        className="btn btn-sm btn-link text-muted p-0"
                        title={collapsed ? 'Expand' : 'Collapse'}
                        onClick={() => setCollapsedPersist(!collapsed)}
                        style={{ lineHeight: 1 }}
                    >
                        <i className={`fas ${collapsed ? 'fa-angle-double-left' : 'fa-angle-double-right'}`}></i>
                    </button>
                </div>
            </div>

            <div
                className="card-body p-2"
                style={{ overflowY: 'auto', flex: 1 }}
            >
                {error && !collapsed && <div className="text-danger small mb-2">{error}</div>}

                {isEmpty && !collapsed && (
                    <div className="text-muted small">
                        Items you add appear here. Pin <i className="fas fa-thumbtack mx-1" style={{ fontSize: 10 }}></i> to keep them visible.
                    </div>
                )}

                {isEmpty && collapsed && (
                    <div className="text-center text-muted" style={{ fontSize: 10, marginTop: 8 }}>
                        <i className="fas fa-bolt"></i>
                    </div>
                )}

                {/* Pinned section */}
                {pinned.length > 0 && (
                    collapsed ? (
                        <div className="d-flex flex-column align-items-center gap-1 mb-2">
                            {pinned.map(renderIconTile)}
                        </div>
                    ) : (
                        <>
                            <div className="small text-muted fw-semibold mb-1">
                                <i className="fas fa-thumbtack me-1 text-warning" style={{ fontSize: 10 }}></i>Pinned
                            </div>
                            <div className="d-grid gap-1 mb-2">
                                {pinned.map((p) => renderTile(p, { showUnpin: true }))}
                            </div>
                        </>
                    )
                )}

                {/* Recent section */}
                {recentVisible.length > 0 && (
                    collapsed ? (
                        <>
                            {pinned.length > 0 && <hr className="my-2" />}
                            <div className="d-flex flex-column align-items-center gap-1">
                                {recentVisible.map(renderIconTile)}
                            </div>
                        </>
                    ) : (
                        <>
                            {pinned.length > 0 && <hr className="my-2" />}
                            <div className="small text-muted fw-semibold mb-1">
                                <i className="fas fa-history me-1"></i>Recent
                            </div>
                            <div className="d-grid gap-1">
                                {recentVisible.map((p) => renderTile(p))}
                            </div>
                        </>
                    )
                )}
            </div>
        </div>
    );
}

/**
 * Record a freshly-added stock item into the per-desk recent list so the
 * RecentProductsPanel can offer it as a quick re-add next time. Dedupes by
 * (productId | name) and caps to MAX_RECENT. Does NOT touch the pinned
 * list — pinning is an explicit teller action.
 */
export function recordRecentFromStockItem(branch, desk, stockItem) {
    if (!stockItem) return;
    const name = stockItem.product?.name || stockItem.name;
    if (!name) return;
    const productId = stockItem.product?.documentId || stockItem.product?.id || null;
    const price = Number(stockItem.selling_price || 0);
    const thumb = productThumbUrl(stockItem.product);
    const key = recentKey(branch, desk);
    // Merge entry: if a prior record exists (e.g. pinned items keyed by
    // same productId), keep its `thumb` if the new one is null — handy
    // when a re-add happens via search results without populated logo.
    const prior = loadList(key);
    const carryThumb = thumb || prior.find(e => productId ? e.productId === productId : e.name === name)?.thumb || null;
    const next = [
        { name, productId, price, thumb: carryThumb },
        ...prior.filter(e => productId ? e.productId !== productId : e.name !== name),
    ].slice(0, MAX_RECENT);
    saveList(key, next);
}
