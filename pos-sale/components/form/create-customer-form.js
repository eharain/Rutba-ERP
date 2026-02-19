import React, { useEffect, useState } from 'react';
import { authApi } from "@rutba/pos-shared/lib/api"; 

export default function CreateCustomerForm({
    initialValue = '',
    onCreated,
    onCancel
}) {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const v = initialValue.trim();
        if (v.includes('@')) setEmail(v);
        else if (/^\+?\d{6,15}$/.test(v.replace(/[^\d+]/g, ''))) setPhone(v);
        else setName(v);
    }, [initialValue]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!name && !email && !phone) return alert('Provide name, email or phone');

        setLoading(true);
        try {
            const res = await authApi.post('/customers', {
                data: { name, email, phone }
            });

            onCreated(res.data?.data ?? res.data??res);
        } catch (err) {
            console.error(err);
            alert('Failed to create customer');
        } finally {
            setLoading(false);
        }
    };

    return (
        <form className="p-3" onSubmit={handleSubmit}>
            <div className="row g-2">
                <div className="col-md-4">
                    <input
                        className="form-control"
                        placeholder="Name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                </div>
                <div className="col-md-4">
                    <input
                        className="form-control"
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                </div>
                <div className="col-md-4">
                    <input
                        className="form-control"
                        placeholder="Phone"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                    />
                </div>
            </div>

            <div className="d-flex justify-content-end gap-2 mt-2">
                <button type="button" className="btn btn-outline-secondary" onClick={onCancel}>
                    Cancel
                </button>
                <button className="btn btn-success" disabled={loading}>
                    {loading ? 'Saving...' : 'Save'}
                </button>
            </div>
        </form>
    );
}
