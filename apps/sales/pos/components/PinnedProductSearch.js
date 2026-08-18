import { useEffect, useRef, useState } from 'react';
import { useUtil } from '@rutba/shared/context/UtilContext';
import SaleApi from '@rutba/shared/lib/saleApi';
import { entryFromStockItem, entryKeyOf } from '../lib/pinnedLists';

/**
 * Search the catalogue and add products straight into a pinned list.
 *
 * Without this the only way to pin something was to ring it up first, so a till
 * could not be set up ahead of a shift — you had to sell a thing to pin it.
 *
 * Deliberately its own component: the manager already juggles list CRUD and item
 * ordering, and search brings debouncing, a request race and its own empty/busy
 * states. Keeping them apart means neither has to know about the other's state.
 *
 * @param {(entry: object) => void} onAdd    called with a pinnable entry
 * @param {Set<string>} existingKeys         entryKeyOf() values already in the list
 * @param {boolean} full                     list is at capacity — adding is blocked
 */
export default function PinnedProductSearch({ onAdd, existingKeys, full = false }) {
    const { currency } = useUtil();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    // Guards against a slow early query landing after a faster later one and
    // overwriting the results the operator is actually looking at.
    const latestRef = useRef('');

    useEffect(() => {
        const t = setTimeout(() => {
            const text = query.trim();
            if (text.length > 1) {
                run(text);
            } else {
                latestRef.current = '';
                setResults([]);
                setError(null);
            }
        }, 300);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query]);

    const run = async (text) => {
        latestRef.current = text;
        setBusy(true);
        setError(null);
        try {
            const aggregated = await SaleApi.searchStockItemsByNameOrBarcode(text);
            if (latestRef.current !== text) return; // a newer query already won
            setResults(aggregated || []);
        } catch (e) {
            if (latestRef.current !== text) return;
            console.error('Pinned-list product search failed', e);
            setResults([]);
            setError('Search failed');
        } finally {
            if (latestRef.current === text) setBusy(false);
        }
    };

    const handleAdd = (stockItem) => {
        const entry = entryFromStockItem(stockItem);
        if (!entry || full) return;
        onAdd(entry);
    };

    return (
        <div className="border-bottom">
            <div className="p-2">
                <div className="input-group input-group-sm">
                    <span className="input-group-text">
                        {busy
                            ? <span className="spinner-border spinner-border-sm" />
                            : <i className="fas fa-search" style={{ fontSize: 11 }} />}
                    </span>
                    <input
                        className="form-control"
                        placeholder={full ? 'List is full' : 'Search products to pin…'}
                        value={query}
                        disabled={full}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                    {query && (
                        <button className="btn btn-outline-secondary" type="button"
                                title="Clear" onClick={() => setQuery('')}>
                            <i className="fas fa-times" style={{ fontSize: 11 }} />
                        </button>
                    )}
                </div>
                {error && <div className="text-danger small mt-1">{error}</div>}
                {!error && !busy && query.trim().length > 1 && results.length === 0 && (
                    <div className="text-muted small mt-1">No products match “{query.trim()}”.</div>
                )}
            </div>

            {results.length > 0 && (
                <div style={{ maxHeight: 150, overflowY: 'auto' }} className="border-top">
                    {results.map((si, i) => {
                        const entry = entryFromStockItem(si);
                        if (!entry) return null;
                        const already = existingKeys?.has(entryKeyOf(entry));
                        return (
                            <button
                                key={`${entryKeyOf(entry)}-${i}`}
                                type="button"
                                className="btn btn-sm btn-link text-decoration-none w-100 text-start d-flex align-items-center gap-2 px-2 py-1 border-bottom"
                                disabled={already || full}
                                title={already ? 'Already in this list' : `Add "${entry.name}"`}
                                onClick={() => handleAdd(si)}
                            >
                                <span
                                    className="d-flex align-items-center justify-content-center bg-white border rounded"
                                    style={{ width: 24, height: 24, flexShrink: 0, overflow: 'hidden' }}
                                >
                                    {entry.thumb ? (
                                        <img src={entry.thumb} alt=""
                                             style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                             onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                    ) : (
                                        <i className="fas fa-box text-muted" style={{ fontSize: 9, opacity: 0.4 }} />
                                    )}
                                </span>
                                <span className="flex-grow-1" style={{ minWidth: 0 }}>
                                    <span className="d-block text-truncate small text-body">{entry.name}</span>
                                    <small className="text-muted">
                                        {currency}{Number(entry.price || 0).toFixed(2)}
                                    </small>
                                </span>
                                <i className={`fas ${already ? 'fa-check text-success' : 'fa-plus text-primary'}`}
                                   style={{ fontSize: 11 }} />
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
