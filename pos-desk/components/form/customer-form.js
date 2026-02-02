import { useEffect, useRef, useState } from 'react';
import { authApi } from '../../lib/api';

export default function CustomerForm({
    customer,
    initialQuery,
    onSaved,
    onCancel
}) {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [duplicate, setDuplicate] = useState(null);
    const [saving, setSaving] = useState(false);

    const lastCheckRef = useRef('');

    useEffect(() => {
        if (customer) {
            setName(customer.name || '');
            setEmail(customer.email || '');
            setPhone(customer.phone || '');
        } else if (initialQuery) {
            const q = initialQuery.trim();
            if (q.includes('@')) setEmail(q);
            else if (/^\+?\d{6,15}$/.test(q)) setPhone(q);
            else setName(q);
        }
    }, [customer, initialQuery]);

    const checkDuplicate = async () => {
        if (!email && !phone) return;

        const key = `${email}|${phone}`;
        if (key === lastCheckRef.current) return;
        lastCheckRef.current = key;

        try {
            const qs = [
                email && `filters[email][$eq]=${encodeURIComponent(email)}`,
                phone && `filters[phone][$eq]=${encodeURIComponent(phone)}`,
                'pagination[pageSize]=1'
            ].join('&');

            const res = await authApi.get(`/customers?${qs}`);
            const found = res.data?.data?.[0];

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
        if (!name && !email && !phone) return;
        if (duplicate) return;

        setSaving(true);
        try {
            const payload = { name, email, phone };
            //const res = customer
            //    ? await authApi.put(`/customers/${customer.documentId}`, { data: payload })
            //    : await authApi.post('/customers', { data: payload });

            // onSaved(res.data?.data);

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
                    <input
                        autoFocus
                        className="form-control"
                        placeholder="Name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                </div>
                <div className="col-md-4">
                    <input
                        className={`form-control ${duplicate ? 'is-invalid' : ''}`}
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onBlur={checkDuplicate}
                    />
                </div>
                <div className="col-md-4">
                    <input
                        className={`form-control ${duplicate ? 'is-invalid' : ''}`}
                        placeholder="Phone"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        onBlur={checkDuplicate}
                    />
                </div>
            </div>

            {duplicate && (
                <div className="alert alert-warning mt-2 py-2">
                    Duplicate detected: {duplicate.name}
                    <button
                        type="button"
                        className="btn btn-sm btn-outline-primary ms-2"
                        onClick={() => onSaved(duplicate)}
                    >
                        Use existing
                    </button>
                </div>
            )}

            <div className="d-flex justify-content-end gap-2 mt-3">
                <button type="button" className="btn btn-outline-secondary" onClick={onCancel}>
                    Cancel
                </button>
                <button className="btn btn-success" disabled={saving}>
                    {saving ? 'Saving…' : 'Save'}
                </button>
            </div>
        </form>
    );
}
