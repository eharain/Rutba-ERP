import { useEffect, useRef, useState } from 'react';
import { authApi } from '@rutba/pos-shared/lib/api';
import { parseContactLine } from '@rutba/pos-shared/lib/utils';
import CustomerForm from './form/customer-form';

export default function CustomerSelect({ value, onChange, disabled }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [mode, setMode] = useState('idle'); // idle | search | form
    const [editingCustomer, setEditingCustomer] = useState(null);
    const [customer, setCustomer] = useState(null);
    const [loading, setLoading] = useState(false);
    const [highlightIndex, setHighlightIndex] = useState(0);

    const timer = useRef(null);
    const containerRef = useRef(null);

   // const __onChange=onChange;

    function handleChange(customer) {
            setCustomer(customer);
            if(onChange)
            onChange(customer);
    };

    const createCustomerFromQuery = (q) => {
        const parsed = parseContactLine((q || '').toString());
        if (parsed.name && parsed.email && parsed.phone) {
            // fully specified: return to parent without persisting
            handleChange(parsed);
            setQuery('');
            setResults([]);
            setMode('idle');
            setEditingCustomer(null);
        } else {
            // open form with parsed fields for user to complete
            setEditingCustomer(parsed.name || parsed.email || parsed.phone ? parsed : null);
            setMode('form');
        }
    };

    /* ---------------- Outside click ---------------- */
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

    /* ---------------- Sync external value ---------------- */
    useEffect(() => {
        if (value?.name) {
            setCustomer(value);
            //setQuery(value.name);
            setMode('idle');
            setEditingCustomer(null);

        } else {
            setCustomer(null);
        }
    }, [value?.documentId, value?.name, value?.email, value?.phone]);

    /* ---------------- Search ---------------- */
    useEffect(() => {
        if (!query || query == customer?.name) {
            setResults([]);
            setMode('idle');
            return;
        }

        setEditingCustomer(null);
        setMode('search');
        setHighlightIndex(0);

        clearTimeout(timer.current);
        timer.current = setTimeout(fetchCustomers, 300);

        return () => clearTimeout(timer.current);
    }, [query]);

    const fetchCustomers = async () => {
        setLoading(true);
        try {
            let equery = encodeURIComponent(query);
            const qs = [
                `filters[$or][0][name][$containsi]=${equery}`,
                `filters[$or][1][email][$containsi]=${equery}`,
                `filters[$or][2][phone][$containsi]=${equery}`,
                'pagination[pageSize]=20'
            ].join('&');

            const res = await authApi.get(`/customers?${qs}`);
            setResults(res?.data || []);
        } catch (e) {
            console.error('Customer search failed', e);
            setResults([]);
        } finally {
            setLoading(false);
        }
    };

    /* ---------------- Keyboard navigation ---------------- */
    const handleKeyDown = (e) => {
        // If Enter pressed and there's a query, use it to create/select customer
        if (e.key === 'Enter') {
            e.preventDefault();
            const q = (query || '').toString().trim();
            if (q) {
                // If in search mode with results, select highlighted result
                if (mode === 'search' && results.length > 0) {
                    selectCustomer(results[highlightIndex]);
                    return;
                }

                // Otherwise, create customer from query (this will open form if needed)
                createCustomerFromQuery(q);
                return;
            }
        }

        if (mode !== 'search' || results.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightIndex(i => Math.min(i + 1, results.length - 1));
        }

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightIndex(i => Math.max(i - 1, 0));
        }

        if (e.key === 'Escape') {
            setMode('idle');
        }
    };

    const selectCustomer = (customer) => {
        handleChange?.(customer);
        setQuery('');
        setEditingCustomer(null);
        setMode('idle');
    };

    function customerName() {
        return [customer?.name,customer?.email,customer?.phone].filter(f=>f!=null).join(' , ')
    }
    return (
        <div className="position-relative" ref={containerRef}>
            <h4 className="form-label" style={{ minHeight: '50px' }}>Customer: <span>{customerName()}</span> <span className="float-end" onClick={() => { if (!disabled) { setMode('form'); setEditingCustomer(customer); } }}><i className="fas fa-edit"></i></span> </h4>
            <div className="input-group">
                <input
                    className="form-control"
                    placeholder="Search customer name, email or phone"
                    value={query}
                    disabled={disabled}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                />
                <button
                    className="btn btn-primary"
                    disabled={disabled || !query || query.trim() === ''}
                    onClick={() => createCustomerFromQuery(query)}
                >
                    <i className="fas fa-user-plus me-1"></i>Add
                </button>
            </div>
            {mode === 'search' && (
                <div className="dropdown-menu show w-100 shadow-sm mt-1 p-0">
                    <div className="list-group list-group-flush">
                        {loading && (
                            <div className="list-group-item text-muted">Searching…</div>
                        )}

                        {!loading && results.map((c, i) => (
                            <div
                                key={c.documentId || c.id}
                                className={`list-group-item d-flex justify-content-between ${i === highlightIndex ? 'active' : ''}`}
                            >
                                <div
                                    className="flex-grow-1"
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => selectCustomer(c)}
                                >
                                    <strong>{c.name}</strong><br />
                                    <small>{c.email} {c.phone && `· ${c.phone}`}</small>
                                </div>
                                <button
                                    className="btn btn-sm btn-outline-secondary"
                                    onClick={() => {
                                        setEditingCustomer(c);
                                        setMode('form');
                                    }}
                                >
                                    <i className="fas fa-edit me-1"></i>Edit
                                </button>
                            </div>
                        ))}

                        {!loading && results.length === 0 && (
                            <button
                                className="list-group-item text-success"
                                onClick={() => createCustomerFromQuery(query)}
                            >
                                ➕ Create new customer
                            </button>
                        )}
                    </div>
                </div>
            )}

            {mode === 'form' && (
                <div className="dropdown-menu show w-100 shadow-sm mt-1 p-0">
                    <CustomerForm
                        customer={editingCustomer}
                        initialQuery={query}
                        onCancel={() => { setMode('idle'); setEditingCustomer(null); }}
                        onSaved={(customer) => {
                            handleChange?.(customer);
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
