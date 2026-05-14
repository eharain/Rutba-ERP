import { useEffect, useRef, useState } from 'react';
import { parseContactLine } from '@rutba/pos-shared/lib/utils';
import { CustomersEndpoints } from '@rutba/api-provider/endpoints/index.js';

/**
 * Three-field contact form (phone, name, email) tuned for the counter
 * teller's workflow:
 *   • Phone is the primary field — it's what tellers ask for first in
 *     retail. Focus + tab order start here.
 *   • If `initialQuery` was passed in (the user typed something into the
 *     search box before hitting "Add"), parseContactLine guesses which
 *     field that string maps to and pre-fills it so the teller doesn't
 *     retype.
 *   • Duplicate detection runs on blur of phone/email and offers a "Use
 *     existing" link instead of silently failing the save.
 *   • Save returns the customer object to the parent — persisting happens
 *     during the sale save, not here.
 */
export default function CustomerForm({
    customer,
    initialQuery,
    onSaved,
    onCancel,
}) {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [duplicate, setDuplicate] = useState(null);
    const [saving, setSaving] = useState(false);

    const lastCheckRef = useRef('');

    useEffect(() => {
        if (customer) {
            setName(customer.name || '');
            setPhone(customer.phone || '');
            setEmail(customer.email || '');
            return;
        }
        if (initialQuery) {
            const parsed = parseContactLine(String(initialQuery).trim());
            setName(parsed.name || '');
            setPhone(parsed.phone || '');
            setEmail(parsed.email || '');
        }
    }, [customer, initialQuery]);

    const checkDuplicate = async () => {
        if (!phone && !email) return;
        const key = `${phone}|${email}`;
        if (key === lastCheckRef.current) return;
        lastCheckRef.current = key;
        try {
            const res = await CustomersEndpoints.findByContact({
                phone: phone || undefined,
                email: email || undefined,
            });
            const found = res.data?.[0];
            if (found && found.documentId !== customer?.documentId) {
                setDuplicate(found);
            } else {
                setDuplicate(null);
            }
        } catch {
            setDuplicate(null);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!name && !phone && !email) return;
        if (duplicate) return;
        setSaving(true);
        try {
            const result = {
                ...(customer?.documentId ? { documentId: customer.documentId } : {}),
                name: name || undefined,
                phone: phone || undefined,
                email: email || undefined,
            };
            if (onSaved) onSaved(result);
        } catch (e) {
            console.error('Customer save failed', e);
        } finally {
            setSaving(false);
        }
    };

    return (
        <form className="p-3" onSubmit={handleSubmit}>
            <div className="row g-2">
                <div className="col-md-4">
                    <label className="form-label small text-muted mb-1">Phone</label>
                    <input
                        autoFocus
                        type="tel"
                        className={`form-control ${duplicate ? 'is-invalid' : ''}`}
                        placeholder="0300 1234567"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        onBlur={checkDuplicate}
                    />
                </div>
                <div className="col-md-4">
                    <label className="form-label small text-muted mb-1">Name</label>
                    <input
                        className="form-control"
                        placeholder="Full name (optional)"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                </div>
                <div className="col-md-4">
                    <label className="form-label small text-muted mb-1">Email</label>
                    <input
                        type="email"
                        className={`form-control ${duplicate ? 'is-invalid' : ''}`}
                        placeholder="optional"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onBlur={checkDuplicate}
                    />
                </div>
            </div>

            {duplicate && (
                <div className="alert alert-warning mt-2 py-2 d-flex justify-content-between align-items-center">
                    <span>
                        <i className="fas fa-info-circle me-1"></i>
                        Existing customer: <strong>{duplicate.name || duplicate.phone || duplicate.email}</strong>
                    </span>
                    <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        onClick={() => onSaved(duplicate)}
                    >
                        Use existing
                    </button>
                </div>
            )}

            <div className="d-flex justify-content-end gap-2 mt-3">
                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onCancel}>
                    Cancel
                </button>
                <button
                    className="btn btn-success btn-sm"
                    disabled={saving || (!name && !phone && !email)}
                >
                    {saving ? 'Saving…' : <><i className="fas fa-check me-1"></i>Save</>}
                </button>
            </div>
        </form>
    );
}
