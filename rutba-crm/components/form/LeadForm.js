import { useState, useEffect } from 'react';
import { CustomersEndpoints, CrmLeadsEndpoints, CrmContactsEndpoints } from '@rutba/api-provider/endpoints';
import ContactPicker from './ContactPicker';

const SOURCES = ['Website', 'Referral', 'Social Media', 'Cold Call', 'Advertisement', 'Other'];
const STATUSES = ['New', 'Contacted', 'Qualified', 'Negotiation', 'Won', 'Lost'];

export default function LeadForm({ lead, contact: presetContact, onSaved, onCancel }) {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [company, setCompany] = useState('');
    const [source, setSource] = useState('');
    const [status, setStatus] = useState('New');
    const [value, setValue] = useState('');
    const [assignedTo, setAssignedTo] = useState('');
    const [assignees, setAssignees] = useState([]);
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    // Linked contact (crm-contact) — auto-created from the lead fields when
    // none is picked, so every lead hangs off a contact record.
    const [selectedContact, setSelectedContact] = useState(presetContact || null);

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
            setAssignedTo(lead.assigned_to?.documentId || '');
            setNotes(lead.notes || '');
            setSelectedCustomer(lead.customer || null);
            setSelectedContact(lead.contact || presetContact || null);
        }
    }, [lead]);

    useEffect(() => {
        CrmLeadsEndpoints.listAssignees()
            .then((res) => setAssignees(res?.data || []))
            .catch(() => setAssignees([]));
    }, []);

    // When picking a contact, prefill empty lead fields from it.
    const handleContactChange = (c) => {
        setSelectedContact(c);
        if (c) {
            if (!name && c.name) setName(c.name);
            if (!email && c.email) setEmail(c.email);
            if (!phone && c.phone) setPhone(c.phone);
            if (!company && c.company) setCompany(c.company);
        }
    };

    useEffect(() => {
        if (!customerQuery || customerQuery.length < 2) {
            setCustomerResults([]);
            return;
        }
        const timer = setTimeout(async () => {
            setSearchingCustomer(true);
            try {
                const res = await CustomersEndpoints.search(customerQuery, 10);
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
            // Every new lead hangs off a crm-contact: create one from the
            // lead fields when the user didn't pick an existing record.
            // Edits keep whatever the lead already has.
            let contact = selectedContact;
            if (!contact?.documentId && !lead?.documentId) {
                const created = await CrmContactsEndpoints.create({
                    name,
                    email: email || undefined,
                    phone: phone || undefined,
                    company: company || undefined,
                });
                contact = created.data || created;
            }

            const data = {
                name,
                email: email || undefined,
                phone: phone || undefined,
                company: company || undefined,
                source: source || undefined,
                status: status || 'New',
                value: value ? parseFloat(value) : undefined,
                // Plain documentId (or null to unassign) — the crm-lead
                // controller applies this server-side; the content API
                // rejects client-written UP-user relations.
                assigned_to: assignedTo || null,
                notes: notes || undefined,
                contact: contact?.documentId ? { connect: [contact.documentId] } : undefined,
                customer: selectedCustomer?.documentId
                    ? { connect: [selectedCustomer.documentId] }
                    : undefined,
            };

            let result;
            if (lead?.documentId) {
                result = await CrmLeadsEndpoints.update(lead.documentId, data);
            } else {
                result = await CrmLeadsEndpoints.create(data);
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
                    <select
                        className="form-select"
                        value={assignedTo}
                        onChange={(e) => setAssignedTo(e.target.value)}
                    >
                        <option value="">— Unassigned —</option>
                        {assignees.map((u) => (
                            <option key={u.documentId} value={u.documentId}>
                                {u.username || u.email}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="col-md-6">
                    <label className="form-label">Contact</label>
                    <ContactPicker value={selectedContact} onChange={handleContactChange} />
                    {!selectedContact && (
                        <small className="text-muted">
                            Leave empty to create a contact from the lead details.
                        </small>
                    )}
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
