import { useState, useEffect } from 'react';
import { CrmContactsEndpoints } from '@rutba/api-provider/endpoints';

/**
 * Debounced crm-contact search dropdown.
 * `value` is the selected contact object (or null); `onChange` receives the
 * picked contact or null when cleared.
 */
export default function ContactPicker({ value, onChange, placeholder }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        if (!query || query.length < 2) {
            setResults([]);
            return;
        }
        const timer = setTimeout(async () => {
            setSearching(true);
            try {
                const res = await CrmContactsEndpoints.list({
                    filters: {
                        $or: [
                            { name: { $containsi: query } },
                            { email: { $containsi: query } },
                            { phone: { $containsi: query } },
                            { company: { $containsi: query } },
                        ],
                    },
                    pageSize: 10,
                });
                setResults(res?.data || []);
            } catch {
                setResults([]);
            } finally {
                setSearching(false);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [query]);

    if (value) {
        return (
            <div className="input-group">
                <input
                    className="form-control"
                    value={value.name || value.email || ''}
                    readOnly
                />
                <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => { onChange(null); setQuery(''); }}
                >
                    <i className="fas fa-times"></i>
                </button>
            </div>
        );
    }

    return (
        <div className="position-relative">
            <input
                className="form-control"
                placeholder={placeholder || 'Search contact by name, email, phone or company'}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
            />
            {results.length > 0 && (
                <div className="dropdown-menu show w-100 shadow-sm mt-1 p-0" style={{ maxHeight: 200, overflowY: 'auto' }}>
                    {results.map((c) => (
                        <button
                            key={c.documentId || c.id}
                            type="button"
                            className="dropdown-item"
                            onClick={() => {
                                onChange(c);
                                setQuery('');
                                setResults([]);
                            }}
                        >
                            <strong>{c.name}</strong>
                            {c.company && <small className="ms-2 text-muted">{c.company}</small>}
                            {c.email && <small className="ms-2 text-muted">{c.email}</small>}
                            {c.phone && <small className="ms-2 text-muted">{c.phone}</small>}
                        </button>
                    ))}
                </div>
            )}
            {searching && <small className="text-muted">Searching…</small>}
        </div>
    );
}
