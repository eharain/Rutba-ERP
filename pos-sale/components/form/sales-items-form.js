import { useState, useEffect, useRef } from 'react';

import { useUtil } from '@rutba/pos-shared/context/UtilContext';
import SaleApi from '@rutba/pos-shared/lib/saleApi';
import { StraipImageUrl, isImage } from '@rutba/api-provider/lib/api';
import { isProductPinned, togglePinForStockItem } from '../RecentProductsPanel';

const MAX_VISIBLE_RESULTS = 12;

/** Resolve the best thumbnail file for a product. Prefer the logo (the
 *  "product photo" by convention), fall back to the first image in the
 *  gallery. Returns the resolved Strapi URL or null. */
function productThumbUrl(product) {
    if (!product) return null;
    const logo = product.logo;
    if (logo && isImage(logo)) {
        const thumb = logo?.formats?.thumbnail || logo;
        return StraipImageUrl(thumb);
    }
    const galleryFirst = Array.isArray(product.gallery)
        ? product.gallery.find(isImage)
        : null;
    if (galleryFirst) {
        const thumb = galleryFirst?.formats?.thumbnail || galleryFirst;
        return StraipImageUrl(thumb);
    }
    return null;
}

/** Render `text` with the first case-insensitive match of `query` wrapped
 *  in <mark>. React-element output (no dangerouslySetInnerHTML), so the
 *  product name stays escape-safe. */
function HighlightMatch({ text, query }) {
    const str = text == null ? '' : String(text);
    if (!query) return str;
    const q = String(query);
    const idx = str.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return str;
    return (
        <>
            {str.slice(0, idx)}
            <mark style={{ padding: 0, background: '#fff3b0', color: 'inherit' }}>
                {str.slice(idx, idx + q.length)}
            </mark>
            {str.slice(idx + q.length)}
        </>
    );
}

export default function SalesItemsForm({
    onAddItem,
    onAddNonStock,
    currentItems = [],
    disabled = false
}) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [showResults, setShowResults] = useState(false);
    const [highlightIndex, setHighlightIndex] = useState(0);
    // Inline quick-add custom-item form. Always visible below the search
    // so tellers can drop in a bag, delivery charge, freehand item, etc.
    // without first triggering an empty search.
    const [customName, setCustomName] = useState('');
    const [customPrice, setCustomPrice] = useState('');
    const [customQty, setCustomQty] = useState('1');
    const [customDiscount, setCustomDiscount] = useState('0');
    // Track pinned-state tick to force re-render after togglePin (which
    // writes to localStorage). The actual lookup happens at render time.
    const [pinTick, setPinTick] = useState(0);
    const { currency, branch, desk } = useUtil();
    const latestSearchRef = useRef('');

    const handleTogglePin = (item, e) => {
        e.stopPropagation();
        togglePinForStockItem(branch, desk, item);
        setPinTick(t => t + 1);
    };

    // Refresh pinned-icon state when the right-panel toggles a pin while
    // the dropdown is open.
    useEffect(() => {
        const handler = () => setPinTick(t => t + 1);
        window.addEventListener('pos.pinnedChanged', handler);
        return () => window.removeEventListener('pos.pinnedChanged', handler);
    }, []);

    // Collect stock-item documentIds already added to the sale
    const usedStockIds = new Set();
    for (const saleItem of currentItems) {
        if (!Array.isArray(saleItem.items)) continue;
        for (const si of saleItem.items) {
            if (si?.documentId) usedStockIds.add(si.documentId);
        }
    }

    /* ---------------- Search with debounce ---------------- */
    useEffect(() => {
        const t = setTimeout(() => {
            if (query.length > 1) {
                search(query);
            } else {
                setResults([]);
                setShowResults(false);
            }
        }, 300);

        return () => clearTimeout(t);
    }, [query]);

    const search = async (text) => {
        latestSearchRef.current = text;
        try {
            const aggregated = await SaleApi.searchStockItemsByNameOrBarcode(text);
            if (latestSearchRef.current !== text) return;
            setResults(aggregated);
            setShowResults(true);
            setHighlightIndex(0);
        } catch (e) {
            if (latestSearchRef.current !== text) return;
            console.error('Product search failed', e);
            setResults([]);
            setShowResults(false);
        }
    };

    const selectStockItem = (item) => {
        onAddItem(item);
        setQuery('');
        setShowResults(false);
    };

    const addNonStockItem = () => {
        if (!query.trim()) return;
        onAddNonStock(query);
        setQuery('');
        setShowResults(false);
    };

    // Custom-item form lives inside the search dropdown's no-match state;
    // its `name` defaults to whatever the teller typed in the search box,
    // so they don't retype. Builds the same space-delimited line the
    // model's parseStockLine parser expects so the add path stays
    // single-source.
    const customNameValue = customName || query;
    const canSubmitCustom = customNameValue.trim() && parseFloat(customPrice) > 0;

    const addCustomFromFields = (e) => {
        e?.preventDefault();
        const name = customNameValue.trim();
        const priceNum = parseFloat(customPrice);
        if (!name || !Number.isFinite(priceNum) || priceNum <= 0) return;
        const qty = Math.max(1, parseInt(customQty, 10) || 1);
        const disc = Math.max(0, parseFloat(customDiscount) || 0);
        const line = `${name} ${priceNum} ${qty} ${disc}`;
        onAddNonStock(line);
        setCustomName('');
        setCustomPrice('');
        setCustomQty('1');
        setCustomDiscount('0');
        setQuery('');
        setShowResults(false);
    };

    /* ---------------- Keyboard navigation ---------------- */
    const handleKeyDown = (e) => {
        if (!showResults) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightIndex(i =>
                Math.min(i + 1, filteredResults.length - 1)
            );
            return;
        }

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightIndex(i =>
                Math.max(i - 1, 0)
            );
            return;
        }

        if (e.key === 'Enter') {
            e.preventDefault();
            filteredResults.length
                ? selectStockItem(filteredResults[highlightIndex])
                : addNonStockItem();
            return;
        }

        if (e.key === 'Escape') {
            setShowResults(false);
        }
    };

    // Filter out products where all stock items are already in the sale
    const filteredResults = results.filter(item => {
        const allIds = [item.documentId, ...(item.more || []).map(m => m.documentId)].filter(Boolean);
        const available = allIds.filter(id => !usedStockIds.has(id));
        return available.length > 0;
    });

    // Compute available stock count per result for display
    const availableCount = (item) => {
        const allIds = [item.documentId, ...(item.more || []).map(m => m.documentId)].filter(Boolean);
        return allIds.filter(id => !usedStockIds.has(id)).length;
    };

    return (
        <div style={{ position: 'relative', marginBottom: 12 }}>
            <div className="input-group input-group-lg">
                <span className="input-group-text bg-white">
                    <i className="fas fa-barcode text-muted"></i>
                </span>
                <input
                    type="text"
                    className="form-control"
                    value={query}
                    disabled={disabled}
                    placeholder="Scan barcode, search items, or type a custom line…"
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    autoFocus={!disabled}
                />
            </div>
            {/* Tiny shorthand hint for power users — the same `name price
                qty disc%` line still works directly in the search input
                and fires on Enter. The full 4-field form lives inside the
                dropdown's no-match state so it only appears when relevant
                (and doesn't look like a phantom items-list row). */}
            <div className="form-text small mt-1">
                <i className="fas fa-lightbulb me-1 text-warning"></i>
                {'Power-user shorthand: type '}
                <code>{'name price qty disc%'}</code>
                {' in the search box and press '}<kbd>{'Enter'}</kbd>
                {' (e.g. '}<code>{'plastic bag 20 1 0'}</code>{').'}
            </div>

            {showResults && (
                <div
                    className="dropdown-menu show w-100 shadow-sm p-0"
                    style={{ maxHeight: '60vh', overflowY: 'auto', zIndex: 10 }}
                >
                    {filteredResults.length > 0 && (
                        <div className="list-group list-group-flush">
                            {filteredResults.slice(0, MAX_VISIBLE_RESULTS).map((item, index) => {
                                const remaining = availableCount(item);
                                const product = item.product;
                                const sellingPrice = Number(item.selling_price || 0);
                                const offerPrice = Number(item.offer_price || 0);
                                const hasOffer = offerPrice > 0 && offerPrice < sellingPrice;
                                const displayPrice = hasOffer ? offerPrice : sellingPrice;
                                const productName = product?.name ?? item.name ?? '\u2014';
                                const subParts = [
                                    item.sku || product?.sku,
                                    item.barcode,
                                    // Product → brands is manyToMany; show the first brand name when present.
                                    Array.isArray(product?.brands) && product.brands.length > 0
                                        ? product.brands.map(b => b?.name).filter(Boolean).join(', ')
                                        : null,
                                ].filter(Boolean);
                                const stockColor = remaining > 5 ? 'success' : remaining > 1 ? 'warning' : 'danger';
                                const active = index === highlightIndex;
                                // Re-read pinned state on every render so the icon
                                // reflects updates triggered from this row or the panel.
                                // (pinTick in deps would be cleaner if useMemo'd; the
                                // direct read keeps it simple and correct.)
                                const _pinTick = pinTick; // eslint-disable-line no-unused-vars
                                const pinned = isProductPinned(branch, desk, item);

                                const thumbUrl = productThumbUrl(product);

                                return (
                                    <button
                                        type="button"
                                        key={`${item.id ?? product?.id ?? productName}_${index}`}
                                        className={`list-group-item list-group-item-action py-2 ${active ? 'active' : ''}`}
                                        onMouseEnter={() => setHighlightIndex(index)}
                                        onClick={() => selectStockItem(item)}
                                    >
                                        <div className="d-flex align-items-center gap-2">
                                            <div
                                                className="d-flex align-items-center justify-content-center bg-white border rounded"
                                                style={{ width: 40, height: 40, flexShrink: 0, overflow: 'hidden' }}
                                            >
                                                {thumbUrl ? (
                                                    <img
                                                        src={thumbUrl}
                                                        alt=""
                                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                                    />
                                                ) : (
                                                    <i className="fas fa-box text-muted" style={{ fontSize: 14, opacity: 0.4 }}></i>
                                                )}
                                            </div>
                                            <div className="flex-grow-1" style={{ minWidth: 0 }}>
                                                <div className="fw-semibold text-truncate">
                                                    <HighlightMatch text={productName} query={query} />
                                                </div>
                                                {subParts.length > 0 && (
                                                    <div className={`small text-truncate ${active ? '' : 'text-muted'}`}>
                                                        {subParts.map((p, i) => (
                                                            <span key={i}>
                                                                {i > 0 && <span className="mx-1">{'\u00b7'}</span>}
                                                                <HighlightMatch text={p} query={query} />
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="text-end" style={{ minWidth: 110, flexShrink: 0 }}>
                                                <div className="fw-bold">
                                                    {hasOffer && (
                                                        <small className={`me-1 text-decoration-line-through ${active ? 'opacity-75' : 'text-muted'}`}>
                                                            {currency}{sellingPrice.toFixed(2)}
                                                        </small>
                                                    )}
                                                    {currency}{displayPrice.toFixed(2)}
                                                </div>
                                                <span
                                                    className={`badge ${active ? 'bg-light text-dark' : `bg-${stockColor} bg-opacity-25 text-${stockColor}`}`}
                                                    style={{ fontSize: 10 }}
                                                >
                                                    {remaining} in stock
                                                </span>
                                            </div>
                                            {/* Pin toggle — rendered as a span (not a nested <button>)
                                                to keep the surrounding list-group-item a valid button. */}
                                            <span
                                                role="button"
                                                tabIndex={-1}
                                                title={pinned ? 'Unpin from quick add' : 'Pin to quick add'}
                                                onClick={(e) => handleTogglePin(item, e)}
                                                onMouseDown={(e) => e.preventDefault()}
                                                className={`px-2 py-1 ${active ? 'text-white' : 'text-muted'}`}
                                                style={{ cursor: 'pointer', flexShrink: 0 }}
                                            >
                                                <i
                                                    className="fas fa-thumbtack"
                                                    style={{
                                                        fontSize: 12,
                                                        opacity: pinned ? 1 : 0.4,
                                                        transform: pinned ? 'none' : 'rotate(45deg)',
                                                        color: pinned && !active ? '#f0a500' : undefined,
                                                    }}
                                                ></i>
                                            </span>
                                        </div>
                                    </button>
                                );
                            })}
                            {filteredResults.length > MAX_VISIBLE_RESULTS && (
                                <div className="list-group-item small text-muted text-center py-2">
                                    {`Showing ${MAX_VISIBLE_RESULTS} of ${filteredResults.length} \u2014 refine your search to narrow.`}
                                </div>
                            )}
                        </div>
                    )}

                    {filteredResults.length === 0 && (
                        <div className="p-3 small">
                            {results.length > 0 ? (
                                <span className="text-muted">
                                    <i className="fas fa-check-circle me-1"></i>
                                    {'All matching items are already in this sale.'}
                                </span>
                            ) : (
                                <>
                                    <div className="text-muted mb-2">
                                        <i className="fas fa-search me-1"></i>
                                        {'No match for '}&ldquo;<strong>{query}</strong>&rdquo;{' \u2014 add it as a custom item:'}
                                    </div>
                                    <form
                                        onSubmit={addCustomFromFields}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        className="row g-2 align-items-center"
                                    >
                                        <div className="col-12 col-md">
                                            <input
                                                type="text"
                                                className="form-control form-control-sm"
                                                placeholder="Item name"
                                                value={customNameValue}
                                                onChange={(e) => setCustomName(e.target.value)}
                                                disabled={disabled}
                                            />
                                        </div>
                                        <div className="col-6 col-md-auto" style={{ width: 120 }}>
                                            <div className="input-group input-group-sm">
                                                <span className="input-group-text">{currency}</span>
                                                <input
                                                    type="number" step="0.01" min="0"
                                                    className="form-control"
                                                    placeholder="Price"
                                                    value={customPrice}
                                                    onChange={(e) => setCustomPrice(e.target.value)}
                                                    autoFocus
                                                />
                                            </div>
                                        </div>
                                        <div className="col-4 col-md-auto" style={{ width: 80 }}>
                                            <div className="input-group input-group-sm">
                                                <span className="input-group-text">{'\u00d7'}</span>
                                                <input
                                                    type="number" min="1" step="1"
                                                    className="form-control"
                                                    value={customQty}
                                                    onChange={(e) => setCustomQty(e.target.value)}
                                                    title="Quantity"
                                                />
                                            </div>
                                        </div>
                                        <div className="col-4 col-md-auto" style={{ width: 90 }}>
                                            <div className="input-group input-group-sm">
                                                <input
                                                    type="number" min="0" max="100" step="1"
                                                    className="form-control text-end"
                                                    value={customDiscount}
                                                    onChange={(e) => setCustomDiscount(e.target.value)}
                                                    title="Discount %"
                                                />
                                                <span className="input-group-text">{'%'}</span>
                                            </div>
                                        </div>
                                        <div className="col-12 col-md-auto">
                                            <button
                                                type="submit"
                                                className="btn btn-success btn-sm w-100"
                                                disabled={disabled || !canSubmitCustom}
                                            >
                                                <i className="fas fa-plus me-1"></i>{'Add'}
                                            </button>
                                        </div>
                                    </form>
                                    <div className="text-muted small mt-2">
                                        <i className="fas fa-bolt me-1 text-warning"></i>
                                        {'Or type the whole line in the search box: '}
                                        <code>{'name price qty disc%'}</code>{' + '}<kbd>{'Enter'}</kbd>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {filteredResults.length > 0 && (
                        <div className="border-top bg-light px-3 py-1 small text-muted d-flex justify-content-between">
                            <span><kbd>{'\u2191'}</kbd><kbd className="ms-1">{'\u2193'}</kbd> {'navigate \u00b7 '}<kbd>{'Enter'}</kbd> {'add'}</span>
                            <span><kbd>{'Esc'}</kbd> {'close'}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
