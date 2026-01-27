//javascript pos-desk/components/CustomerSelect.js
import React, { useState, useEffect, useRef } from 'react';
import { authApi } from '../lib/api';

/**
 * CustomerSelect
 * - Props:
 *   - value: selected customer object or null
 *   - onChange: function(customer|null)
 *   - disabled: boolean
 *
 * Simple searchable dropdown that finds customers by name, email or phone.
 */
export default function CustomerSelect({ value, onChange, disabled }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const timer = useRef(null);
    const containerRef = useRef(null);

    useEffect(() => {
        // close dropdown on outside click
        const onClick = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setOpen(false);
            }
        };
        document.addEventListener('click', onClick);
        return () => document.removeEventListener('click', onClick);
    }, []);

    useEffect(() => {
        if (!query || query.trim().length === 0) {
            setResults([]);
            return;
        }

        // debounce
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
            fetchCustomers(query);
        }, 300);

        return () => clearTimeout(timer.current);
    }, [query]);

    const fetchCustomers = async (q) => {
        setLoading(true);
        try {
            // Search customers by name, email or phone (case-insensitive contains)
            const qs = [
                `filters[$or][0][name][$containsi]=${encodeURIComponent(q)}`,
                `filters[$or][1][email][$containsi]=${encodeURIComponent(q)}`,
                `filters[$or][2][phone][$containsi]=${encodeURIComponent(q)}`,
                'pagination[pageSize]=10',
                'populate=*'
            ].join('&');

            const res = await authApi.get(`/customers?${qs}`);
            const data = res.data?.data ?? res.data ?? res;
            // Normalize a few possible shapes
            const list = Array.isArray(data) ? data : (data?.data ?? []);
            setResults(list);
            setOpen(true);
        } catch (err) {
            console.error('Customer search error', err);
            setResults([]);
        } finally {
            setLoading(false);
        }
    };

    const handleSelect = (customer) => {
        setQuery(customer?.name || '');
        setOpen(false);
        onChange && onChange(customer);
    };

    const handleClear = () => {
        setQuery('');
        setResults([]);
        setOpen(false);
        onChange && onChange(null);
    };

    return (
        <div ref={containerRef} style={{ position: 'relative', minWidth: 240 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                    type="text"
                    placeholder="Search by name, email or phone"
                    value={query || (value?.name ?? '')}
                    onChange={(e) => {
                        setQuery(e.target.value);
                    }}
                    onFocus={() => { if (query && query.length > 0) setOpen(true); }}
                    disabled={disabled}
                    style={{ width: '100%', padding: '8px' }}
                />
                <button
                    type="button"
                    onClick={() => value ? handleClear() : setOpen(s => !s)}
                    disabled={disabled}
                    style={{
                        padding: '8px 10px',
                        background: value ? '#dc3545' : '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: 4,
                        cursor: 'pointer'
                    }}
                >
                    {value ? 'Clear' : (open ? 'Close' : 'Find')}
                </button>
            </div>

            {open && (
                <div style={{
                    position: 'absolute',
                    zIndex: 999,
                    background: 'white',
                    border: '1px solid #ddd',
                    width: '100%',
                    maxHeight: 260,
                    overflowY: 'auto',
                    marginTop: 6,
                    borderRadius: 4,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                }}>
                    {loading && <div style={{ padding: 10 }}>Searching...</div>}
                    {!loading && results.length === 0 && <div style={{ padding: 10, color: '#666' }}>No customers found.</div>}
                    {!loading && results.map((c) => (
                        <div
                            key={c.id || c.documentId || `${c.email}-${c.phone}`}
                            onClick={() => handleSelect(c)}
                            style={{ padding: 10, borderBottom: '1px solid #f1f1f1', cursor: 'pointer' }}
                        >
                            <div style={{ fontWeight: 600 }}>{c.name || c.fullName || 'Unnamed'}</div>
                            <div style={{ fontSize: 12, color: '#555' }}>{c.email || ''} {c.phone ? `· ${c.phone}` : ''}</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}