import { useEffect, useRef, useState } from 'react';
import { parseContactLine } from '@rutba/pos-shared/lib/utils';
import CustomerForm from './form/customer-form';
import { CustomersEndpoints } from '@rutba/api-provider/endpoints/index.js';

/**
 * Counter-friendly customer picker.
 *
 * Tellers typically have a phone number first and a name second — and most
 * walk-in sales need no customer at all. So:
 *   • When no customer is set: a thin search input (`Phone, name, or
 *     email…`) that searches across all three fields, plus an "Add" button
 *     that opens a 3-field form pre-populated from whatever was typed.
 *   • When a customer IS set: a compact chip showing name + phone with
 *     pencil/× buttons. Click chip to expand into a search again.
 *   • Enter on the input selects the highlighted result, or — if there are
 *     no results — pre-fills the form with the typed value so a manager can
 *     finish adding the contact in one keystroke.
 */
export default function CustomerSelect({ value, onChange, disabled }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [mode, setMode] = useState('idle'); // idle | search | form
    const [editingCustomer, setEditingCustomer] = useState(null);
    const [loading, setLoading] = useState(false);
    const [highlightIndex, setHighlightIndex] = useState(0);

    const timer = useRef(null);
    const containerRef = useRef(null);

    const customer = value && (value.name || value.email || value.phone) ? value : null;

    const handleChange = (next) => { if (onChange) onChange(next); };

    const createCustomerFromQuery = (q) => {
        const parsed = parseContactLine((q || '').toString());
        if (parsed.name && parsed.email && parsed.phone) {
            handleChange(parsed);
            setQuery('');
            setResults([]);
            setMode('idle');
            setEditingCustomer(null);
        } else {
            setEditingCustomer(parsed.name || parsed.email || parsed.phone ? parsed : null);
            setMode('form');
        }
    };

    /* outside click closes search/form */
    useEffect(() => {
        const handler = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setMode('idle');
                setEditingCustomer(null);
            }
        };
        document.addEventListener('click', handler);
        return () => document.removeEventListener('click', handler);
    }, []);

    /* search debounce */
    useEffect(() => {
        if (!query) {
            setResults([]);
            if (mode === 'search') setMode('idle');
            return;
        }
        setEditingCustomer(null);
        setMode('search');
        setHighlightIndex(0);

        clearTimeout(timer.current);
        timer.current = setTimeout(fetchCustomers, 300);
        return () => clearTimeout(timer.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query]);

    const fetchCustomers = async () => {
        setLoading(true);
        try {
            const res = await CustomersEndpoints.search(query, 20);
            setResults(res?.data || res || []);
        } catch (e) {
            console.error('Customer search failed', e);
            setResults([]);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const q = (query || '').toString().trim();
            if (!q) return;
            if (mode === 'search' && results.length > 0) {
                selectCustomer(results[highlightIndex]);
                return;
            }
            createCustomerFromQuery(q);
            return;
        }

        if (mode !== 'search' || results.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightIndex(i => Math.min(i + 1, results.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightIndex(i => Math.max(i - 1, 0));
        } else if (e.key === 'Escape') {
            setMode('idle');
        }
    };

    const selectCustomer = (c) => {
        handleChange(c);
        setQuery('');
        setEditingCustomer(null);
        setMode('idle');
    };

    const clearCustomer = (e) => {
        e?.stopPropagation();
        handleChange(null);
        setQuery('');
        setMode('idle');
    };

    /* ── Compact chip view when a customer is already set ── */
    if (customer && mode !== 'form') {
        return (
            <div className="position-relative" ref={containerRef}>
                <div
                    className="d-inline-flex align-items-center gap-2 bg-light border rounded-pill px-3 py-1"
                    style={{ maxWidth: '100%' }}
                >
                    <i className="fas fa-user text-muted small"></i>
                    <span className="fw-semibold text-truncate" style={{ maxWidth: 200 }}>
                        {customer.name || customer.phone || customer.email || 'Customer'}
                    </span>
                    {customer.phone && customer.name && (
                        <span className="text-muted small text-truncate" style={{ maxWidth: 140 }}>
                            {customer.phone}
                        </span>
                    )}
                    {!disabled && (
                        <>
                            <button
                                type="button"
                                className="btn btn-sm btn-link p-0 text-muted"
                                title="Edit customer"
                                onClick={() => { setEditingCustomer(customer); setMode('form'); }}
                            >
                                <i className="fas fa-pen"></i>
                            </button>
                            <button
                                type="button"
                                className="btn btn-sm btn-link p-0 text-muted"
                                title="Remove customer"
                                onClick={clearCustomer}
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </>
                    )}
                </div>

                {mode === 'form' && (
                    <div className="position-absolute w-100 bg-white border rounded shadow-sm mt-1 p-0" style={{ minWidth: 480, left: 0, zIndex: 1000 }}>
                        <CustomerForm
                            customer={editingCustomer}
                            onCancel={() => { setMode('idle'); setEditingCustomer(null); }}
                            onSaved={(c) => { handleChange(c); setMode('idle'); setEditingCustomer(null); }}
                        />
                    </div>
                )}
            </div>
        );
    }

    /* ── Search view (no customer set) ── */
    return (
        <div className="position-relative" ref={containerRef}>
            <div className="input-group input-group-sm">
                <span className="input-group-text bg-white">
                    <i className="fas fa-user text-muted"></i>
                </span>
                <input
                    className="form-control"
                    placeholder="Customer phone, name or email — optional"
                    value={query}
                    disabled={disabled}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                />
                <button
                    type="button"
                    className="btn btn-outline-primary"
                    disabled={disabled || !query.trim()}
                    onClick={() => createCustomerFromQuery(query)}
                >
                    <i className="fas fa-user-plus me-1"></i>Add
                </button>
            </div>

            {mode === 'search' && (
                <div className="position-absolute w-100 bg-white border rounded shadow-sm mt-1 p-0" style={{ left: 0, zIndex: 1000 }}>
                    <div className="list-group list-group-flush">
                        {loading && <div className="list-group-item small text-muted">Searching…</div>}

                        {!loading && results.map((c, i) => (
                            <div
                                key={c.documentId || c.id}
                                className={`list-group-item d-flex justify-content-between align-items-center ${i === highlightIndex ? 'active' : ''}`}
                            >
                                <div
                                    className="flex-grow-1"
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => selectCustomer(c)}
                                >
                                    <div className="fw-semibold">{c.name || '(no name)'}</div>
                                    <div className="small text-muted">
                                        {[c.phone, c.email].filter(Boolean).join(' · ')}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className="btn btn-sm btn-outline-secondary"
                                    onClick={() => { setEditingCustomer(c); setMode('form'); }}
                                >
                                    <i className="fas fa-pen"></i>
                                </button>
                            </div>
                        ))}

                        {!loading && results.length === 0 && (
                            <button
                                type="button"
                                className="list-group-item list-group-item-action text-success"
                                onClick={() => createCustomerFromQuery(query)}
                            >
                                <i className="fas fa-plus me-1"></i>Add new customer “{query}”
                            </button>
                        )}
                    </div>
                </div>
            )}

            {mode === 'form' && (
                <div className="dropdown-menu show w-100 shadow-sm mt-1 p-0" style={{ minWidth: 480 }}>
                    <CustomerForm
                        customer={editingCustomer}
                        initialQuery={query}
                        onCancel={() => { setMode('idle'); setEditingCustomer(null); }}
                        onSaved={(c) => {
                            handleChange(c);
                            setQuery('');
                            setResults([]);
                            setMode('idle');
                            setEditingCustomer(null);
                        }}
                    />
                </div>
            )}
        </div>
    );
}
