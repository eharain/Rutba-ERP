import { useState, useEffect } from 'react';
import { authApi } from '@rutba/pos-shared/lib/api';

const SOURCES = ['Website', 'Referral', 'Social Media', 'Cold Call', 'Advertisement', 'Other'];
const STATUSES = ['New', 'Contacted', 'Qualified', 'Negotiation', 'Won', 'Lost'];

export default function LeadForm({ lead, onSaved, onCancel }) {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [company, setCompany] = useState('');
    const [source, setSource] = useState('');
    const [status, setStatus] = useState('New');
    const [value, setValue] = useState('');
    const [assignedTo, setAssignedTo] = useState('');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    // Customer search
    const [customerQuery, setCustomerQuery] = useState('');
    const [customerResults, setCustomerResults] = useState([]);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [searchingCustomer, setSearchingCustomer] = useState(false);

    useEffect(() => {
        if (lead) {
            setName(lead.name || '');
            setEmail(lead.email || '');
            setPhone(lead.phone || '');
            setCompany(lead.company || '');
            setSource(lead.source || '');
            setStatus(lead.status || 'New');
            setValue(lead.value != null ? String(lead.value) : '');
            setAssignedTo(lead.assigned_to || '');
            setNotes(lead.notes || '');
            setSelectedCustomer(lead.customer || null);
        }
    }, [lead]);

    useEffect(() => {
        if (!customerQuery || customerQuery.length < 2) {
            setCustomerResults([]);
            return;
        }
        const timer = setTimeout(async () => {
            setSearchingCustomer(true);
            try {
                const eq = encodeURIComponent(customerQuery);
                const qs = [
                    `filters[$or][0][name][$containsi]=${eq}`,
                    `filters[$or][1][email][$containsi]=${eq}`,
                    `filters[$or][2][phone][$containsi]=${eq}`,
                    'pagination[pageSize]=10',
                ].join('&');
                const res = await authApi.get(`/customers?${qs}`);
                setCustomerResults(res?.data || []);
            } catch {
                setCustomerResults([]);
            } finally {
                setSearchingCustomer(false);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [customerQuery]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!name) return;

        setSaving(true);
        setError(null);
        try {
            const payload = {
                data: {
                    name,
                    email: email || undefined,
                    phone: phone || undefined,
                    company: company || undefined,
                    source: source || undefined,
                    status: status || 'New',
                    value: value ? parseFloat(value) : undefined,
                    assigned_to: assignedTo || undefined,
                    notes: notes || undefined,
                    customer: selectedCustomer?.documentId
                        ? { connect: [selectedCustomer.documentId] }
                        : undefined,
                },
            };

            let result;
            if (lead?.documentId) {
                result = await authApi.put(`/crm-leads/${lead.documentId}`, payload);
            } else {
                result = await authApi.post('/crm-leads', payload);
            }

            if (onSaved) onSaved(result.data || result);
        } catch (err) {
            console.error('Lead save failed', err);
            setError('Failed to save lead. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit}>
            {error && <div className="alert alert-danger py-2">{error}</div>}

            <div className="row g-3">
                <div className="col-md-6">
                    <label className="form-label">Name *</label>
                    <input
                        autoFocus
                        className="form-control"
                        placeholder="Lead name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                    />
                </div>
                <div className="col-md-6">
                    <label className="form-label">Company</label>
                    <input
                        className="form-control"
                        placeholder="Company name"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                    />
                </div>
                <div className="col-md-6">
                    <label className="form-label">Email</label>
                    <input
                        className="form-control"
                        type="email"
                        placeholder="Email address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                </div>
                <div className="col-md-6">
                    <label className="form-label">Phone</label>
                    <input
                        className="form-control"
                        placeholder="Phone number"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                    />
                </div>
                <div className="col-md-4">
                    <label className="form-label">Source</label>
                    <select
                        className="form-select"
                        value={source}
                        onChange={(e) => setSource(e.target.value)}
                    >
                        <option value="">— Select —</option>
                        {SOURCES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                </div>
                <div className="col-md-4">
                    <label className="form-label">Status</label>
                    <select
                        className="form-select"
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                    >
                        {STATUSES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                </div>
                <div className="col-md-4">
                    <label className="form-label">Value</label>
                    <input
                        className="form-control"
                        type="number"
                        step="0.01"
                        placeholder="Deal value"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                    />
                </div>
                <div className="col-md-6">
                    <label className="form-label">Assigned To</label>
                    <input
                        className="form-control"
                        placeholder="Assignee name"
                        value={assignedTo}
                        onChange={(e) => setAssignedTo(e.target.value)}
                    />
                </div>
                <div className="col-md-6">
                    <label className="form-label">Customer</label>
                    {selectedCustomer ? (
                        <div className="input-group">
                            <input
                                className="form-control"
                                value={selectedCustomer.name || selectedCustomer.email || ''}
                                readOnly
                            />
                            <button
                                type="button"
                                className="btn btn-outline-secondary"
                                onClick={() => { setSelectedCustomer(null); setCustomerQuery(''); }}
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                    ) : (
                        <div className="position-relative">
                            <input
                                className="form-control"
                                placeholder="Search customer by name, email or phone"
                                value={customerQuery}
                                onChange={(e) => setCustomerQuery(e.target.value)}
                            />
                            {customerResults.length > 0 && (
                                <div className="dropdown-menu show w-100 shadow-sm mt-1 p-0" style={{ maxHeight: 200, overflowY: 'auto' }}>
                                    {customerResults.map((c) => (
                                        <button
                                            key={c.documentId || c.id}
                                            type="button"
                                            className="dropdown-item"
                                            onClick={() => {
                                                setSelectedCustomer(c);
                                                setCustomerQuery('');
                                                setCustomerResults([]);
                                                if (!name && c.name) setName(c.name);
                                                if (!email && c.email) setEmail(c.email);
                                                if (!phone && c.phone) setPhone(c.phone);
                                            }}
                                        >
                                            <strong>{c.name}</strong>
                                            {c.email && <small className="ms-2 text-muted">{c.email}</small>}
                                            {c.phone && <small className="ms-2 text-muted">{c.phone}</small>}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {searchingCustomer && <small className="text-muted">Searching…</small>}
                        </div>
                    )}
                </div>
                <div className="col-12">
                    <label className="form-label">Notes</label>
                    <textarea
                        className="form-control"
                        rows={3}
                        placeholder="Additional notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                    />
                </div>
            </div>

            <div className="d-flex justify-content-end gap-2 mt-4">
                {onCancel && (
                    <button type="button" className="btn btn-outline-secondary" onClick={onCancel}>
                        Cancel
                    </button>
                )}
                <button className="btn btn-primary" disabled={saving || !name}>
                    {saving ? 'Saving…' : lead?.documentId ? 'Update Lead' : 'Create Lead'}
                </button>
            </div>
        </form>
    );
}
