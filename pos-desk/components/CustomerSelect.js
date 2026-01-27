// javascript pos-desk/components/CustomerSelect.js
import React, { useState, useEffect, useRef } from 'react';
import { authApi } from '../lib/api';

/**
 * CustomerSelect
 * - Props:
 *   - value: selected customer object or null
 *   - onChange: function(customer|null)
 *   - disabled: boolean
 *   - allowCreate: boolean (default true)
 *
 * Search customers by name, email or phone. Also allows creating a new customer.
 * If the current search text looks like an email or phone number it will prefill
 * the create form accordingly.
 */
export default function CustomerSelect({ value, onChange, disabled, allowCreate = true }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [creating, setCreating] = useState(false);

    // create form fields
    const [nameField, setNameField] = useState('');
    const [emailField, setEmailField] = useState('');
    const [phoneField, setPhoneField] = useState('');

    const timer = useRef(null);
    const containerRef = useRef(null);

    useEffect(() => {
        // outside click closes dropdown / create
        const onClick = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setOpen(false);
                setShowCreate(false);
            }
        };
        document.addEventListener('click', onClick);
        return () => document.removeEventListener('click', onClick);
    }, []);

    useEffect(() => {
        // keep input in sync with externally provided value
        if (!query && value?.name) {
            setQuery(value.name);
        }
    }, [value]);

    useEffect(() => {
        if (!query || query.trim().length === 0) {
            setResults([]);
            return;
        }

        // debounce fetch
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
            // Normalize possible shapes
            const list = Array.isArray(data) ? data : (data?.data ?? []);
            setResults(list);
            setOpen(true);
            setShowCreate(false);
        } catch (err) {
            console.error('Customer search error', err);
            setResults([]);
        } finally {
            setLoading(false);
        }
    };

    const detectQueryTypeAndPrefill = (q) => {
        // simple heuristics
        const trimmed = (q || '').trim();
        const hasAt = trimmed.includes('@');
        const digits = trimmed.replace(/[^\d+]/g, '');
        const isPhone = /^\+?\d{6,15}$/.test(digits);
        if (hasAt) {
            setEmailField(trimmed);
            setPhoneField('');
            setNameField('');
        } else if (isPhone) {
            setPhoneField(trimmed);
            setEmailField('');
            setNameField('');
        } else {
            setNameField(trimmed);
            setEmailField('');
            setPhoneField('');
        }
    };

    const handleSelect = (customer) => {
        setQuery(customer?.name || '');
        setOpen(false);
        setShowCreate(false);
        onChange && onChange(customer);
    };

    const handleClear = () => {
        setQuery('');
        setResults([]);
        setOpen(false);
        setShowCreate(false);
        onChange && onChange(null);
    };

    const openCreateForm = (prefillFromQuery = true) => {
        setShowCreate(true);
        setOpen(false);
        if (prefillFromQuery) detectQueryTypeAndPrefill(query);
    };

    const handleCreate = async (e) => {
        e && e.preventDefault();
        if (creating) return;
        const name = (nameField || '').trim();
        const email = (emailField || '').trim();
        const phone = (phoneField || '').trim();

        if (!name && !email && !phone) {
            alert('Please provide name, email or phone for the new customer.');
            return;
        }

        setCreating(true);
        try {
            // Strapi-style payload where collections are created with { data: {...} }
            const res = await authApi.post('/customers', {
                data: {
                    name: name || undefined,
                    email: email || undefined,
                    phone: phone || undefined
                }
            });

            const created = res.data?.data ?? res.data ?? res;
            // set as selected
            setQuery(created?.name || name || email || phone);
            onChange && onChange(created);
            setShowCreate(false);
            setResults([]);
        } catch (err) {
            console.error('Error creating customer', err);
            alert('Failed to create customer');
        } finally {
            setCreating(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            // If results available, select first
            if (results && results.length > 0) {
                handleSelect(results[0]);
            } else if (allowCreate) {
                openCreateForm(true);
            }
        } else if (e.key === 'Escape') {
            setOpen(false);
            setShowCreate(false);
        }
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
                    onKeyDown={handleKeyDown}
                    disabled={disabled}
                    style={{ width: '100%', padding: '8px' }}
                />
                <button
                    type="button"
                    onClick={() => {
                        if (value) handleClear();
                        else if (allowCreate) openCreateForm(true);
                        else setOpen(s => !s);
                    }}
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
                    {value ? 'Clear' : (open ? 'Close' : (allowCreate ? 'Add' : 'Find'))}
                </button>
            </div>

            {/* Dropdown results */}
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
                    {!loading && results.length === 0 && <div style={{ padding: 10, color: '#666' }}>
                        No customers found.
                        {allowCreate && <div style={{ marginTop: 8 }}>
                            <button
                                type="button"
                                onClick={() => openCreateForm(true)}
                                style={{ padding: '6px 10px', background: '#28a745', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                            >
                                Create new customer
                            </button>
                        </div>}
                    </div>}
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

            {/* Create form */}
            {showCreate && (
                <div style={{
                    position: 'absolute',
                    zIndex: 999,
                    background: 'white',
                    border: '1px solid #ddd',
                    width: '100%',
                    marginTop: 6,
                    borderRadius: 4,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    padding: 12
                }}>
                    <form onSubmit={handleCreate}>
                        <div style={{ marginBottom: 8 }}>
                            <label style={{ display: 'block', fontSize: 12 }}>Name</label>
                            <input
                                type="text"
                                value={nameField}
                                onChange={(e) => setNameField(e.target.value)}
                                style={{ width: '100%', padding: 8 }}
                                placeholder="Full name"
                            />
                        </div>
                        <div style={{ marginBottom: 8 }}>
                            <label style={{ display: 'block', fontSize: 12 }}>Email</label>
                            <input
                                type="email"
                                value={emailField}
                                onChange={(e) => setEmailField(e.target.value)}
                                style={{ width: '100%', padding: 8 }}
                                placeholder="Email address"
                            />
                        </div>
                        <div style={{ marginBottom: 8 }}>
                            <label style={{ display: 'block', fontSize: 12 }}>Phone</label>
                            <input
                                type="text"
                                value={phoneField}
                                onChange={(e) => setPhoneField(e.target.value)}
                                style={{ width: '100%', padding: 8 }}
                                placeholder="Phone number"
                            />
                        </div>

                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button
                                type="button"
                                onClick={() => { setShowCreate(false); }}
                                style={{ padding: '8px 12px', background: '#6c757d', color: 'white', border: 'none', borderRadius: 4 }}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={creating}
                                style={{ padding: '8px 12px', background: '#28a745', color: 'white', border: 'none', borderRadius: 4 }}
                            >
                                {creating ? 'Creating...' : 'Create Customer'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}