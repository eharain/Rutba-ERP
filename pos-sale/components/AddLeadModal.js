import { useState } from 'react';
import { authApi } from '@rutba/pos-shared/lib/api';

const SOURCES = ['Website', 'Referral', 'Social Media', 'Cold Call', 'Advertisement', 'Other'];

export default function AddLeadModal({ isOpen, onClose, customer }) {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [company, setCompany] = useState('');
    const [source, setSource] = useState('');
    const [value, setValue] = useState('');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState(null);

    // Pre-fill from customer when the modal opens
    const handleOpen = () => {
        if (customer) {
            setName(customer.name || '');
            setEmail(customer.email || '');
            setPhone(customer.phone || '');
        }
        setSuccess(false);
        setError(null);
    };

    if (!isOpen) return null;

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
                    status: 'New',
                    value: value ? parseFloat(value) : undefined,
                    notes: notes || undefined,
                    customer: customer?.documentId
                        ? { connect: [customer.documentId] }
                        : undefined,
                },
            };

            await authApi.post('/crm-leads', payload);
            setSuccess(true);
            setTimeout(() => {
                onClose(true);
                resetForm();
            }, 1500);
        } catch (err) {
            console.error('Failed to create lead', err);
            setError('Failed to create lead. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const resetForm = () => {
        setName('');
        setEmail('');
        setPhone('');
        setCompany('');
        setSource('');
        setValue('');
        setNotes('');
        setSuccess(false);
        setError(null);
    };

    return (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <div className="modal-dialog modal-lg">
                <div className="modal-content">
                    <div className="modal-header">
                        <h5 className="modal-title">
                            <i className="fas fa-bullhorn me-2"></i>Create CRM Lead
                        </h5>
                        <button type="button" className="btn-close" onClick={() => { onClose(false); resetForm(); }}></button>
                    </div>
                    <form onSubmit={handleSubmit}>
                        <div className="modal-body">
                            {success && (
                                <div className="alert alert-success py-2">
                                    <i className="fas fa-check-circle me-1"></i>Lead created successfully!
                                </div>
                            )}
                            {error && <div className="alert alert-danger py-2">{error}</div>}

                            {customer && (
                                <div className="alert alert-info py-2 mb-3">
                                    <i className="fas fa-link me-1"></i>
                                    Linking to customer: <strong>{customer.name}</strong>
                                    {customer.email && <span className="ms-2">({customer.email})</span>}
                                </div>
                            )}

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
                                <div className="col-md-6">
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
                                <div className="col-md-6">
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
                                <div className="col-12">
                                    <label className="form-label">Notes</label>
                                    <textarea
                                        className="form-control"
                                        rows={2}
                                        placeholder="Additional notes"
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button type="button" className="btn btn-outline-secondary" onClick={() => { onClose(false); resetForm(); }}>
                                Cancel
                            </button>
                            <button className="btn btn-primary" disabled={saving || !name || success}>
                                {saving ? 'Creating…' : 'Create Lead'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
