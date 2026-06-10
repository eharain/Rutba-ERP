import { useState, useEffect } from 'react';
import { CrmContactsEndpoints } from '@rutba/api-provider/endpoints';

export default function ContactForm({ contact, onSaved, onCancel }) {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [company, setCompany] = useState('');
    const [address, setAddress] = useState('');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (contact) {
            setName(contact.name || '');
            setEmail(contact.email || '');
            setPhone(contact.phone || '');
            setCompany(contact.company || '');
            setAddress(contact.address || '');
            setNotes(contact.notes || '');
        }
    }, [contact]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!name) return;

        setSaving(true);
        setError(null);
        try {
            const data = {
                name,
                email: email || undefined,
                phone: phone || undefined,
                company: company || undefined,
                address: address || undefined,
                notes: notes || undefined,
            };

            let result;
            if (contact?.documentId) {
                result = await CrmContactsEndpoints.update(contact.documentId, data);
            } else {
                result = await CrmContactsEndpoints.create(data);
            }

            if (onSaved) onSaved(result.data || result);
        } catch (err) {
            console.error('Contact save failed', err);
            setError('Failed to save contact. Please try again.');
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
                        placeholder="Contact name"
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
                <div className="col-12">
                    <label className="form-label">Address</label>
                    <textarea
                        className="form-control"
                        rows={2}
                        placeholder="Address"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                    />
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
                    {saving ? 'Saving…' : contact?.documentId ? 'Update Contact' : 'Create Contact'}
                </button>
            </div>
        </form>
    );
}
