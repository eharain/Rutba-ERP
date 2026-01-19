// /pos-desk/components/form/purchase-form.js
import React, { useState, useEffect } from 'react';
import { authApi } from '../../lib/api';
import { useUtil } from '../../context/UtilContext';

const PurchaseForm = ({ purchase, onSubmit, onCancel }) => {
    const { generateNextPONumber, branch, user } = useUtil();
    const [formData, setFormData] = useState({
        orderId: '',
        order_date: new Date().toISOString().split('T')[0],
        suppliers: [],
        status: 'Draft',
        total: 0
    });
    const [suppliers, setSuppliers] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (purchase) {
            setFormData({
                orderId: purchase.orderId || '',
                order_date: purchase.order_date?.split('T')[0] || new Date().toISOString().split('T')[0],
                suppliers: purchase.suppliers || [],
                status: purchase.status || 'Draft',
                total: purchase.total || 0
            });
        } else {
            setFormData(prev => ({
                ...prev,
                orderId: generateNextPONumber()
            }));
        }
        loadSuppliers();
    }, [purchase]);

    const loadSuppliers = async () => {
        try {
            const response = await authApi.get('/suppliers');
            setSuppliers(response.data || []);
        } catch (error) {
            console.error('Error loading suppliers:', error);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSupplierChange = (e) => {
        const selectedOptions = Array.from(e.target.selectedOptions, option =>
            suppliers.find(s => s.id == option.value)
        );
        setFormData(prev => ({ ...prev, suppliers: selectedOptions }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const purchaseData = {
                ...formData,
                suppliers: { connect: formData.suppliers.map(s => s.documentId || s.id) },
                users: { connect: [user.documentId] },
                
              //  branch: { connect: [branch.documentId || branch.id ]}
            };

            if (purchase?.documentId) {
                await authApi.put(`/purchases/${purchase.documentId}`, { data: purchaseData });
            } else {
                await authApi.post('/purchases', { data: purchaseData });
            }

            onSubmit && onSubmit();
        } catch (error) {
            console.error('Error saving purchase:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ padding: '20px', maxWidth: '600px' }}>
            <h2>{purchase ? 'Edit Purchase Order' : 'Create Purchase Order'}</h2>

            <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: '15px' }}>
                    <label>Purchase Number:</label>
                    <input
                        type="text"
                        name="orderId"
                        value={formData.orderId}
                        onChange={handleInputChange}
                        required
                        style={{ width: '100%', padding: '8px' }}
                    />
                </div>

                <div style={{ marginBottom: '15px' }}>
                    <label>Order Date:</label>
                    <input
                        type="date"
                        name="order_date"
                        value={formData.order_date}
                        onChange={handleInputChange}
                        required
                        style={{ width: '100%', padding: '8px' }}
                    />
                </div>

                <div style={{ marginBottom: '15px' }}>
                    <label>Suppliers:</label>
                    <select
                        multiple
                        value={formData.suppliers.map(s => s.id)}
                        onChange={handleSupplierChange}
                        style={{ width: '100%', padding: '8px', height: '100px' }}
                    >
                        {suppliers.map(supplier => (
                            <option key={supplier.id} value={supplier.id}>
                                {supplier.name} - {supplier.contact_person}
                            </option>
                        ))}
                    </select>
                    <small>Hold Ctrl/Cmd to select multiple suppliers</small>
                </div>

                <div style={{ marginBottom: '15px' }}>
                    <label>Status:</label>
                    <select
                        name="status"
                        value={formData.status}
                        onChange={handleInputChange}
                        style={{ width: '100%', padding: '8px' }}
                    >
                        <option value="Draft">Draft</option>
                        
                    </select>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                        type="submit"
                        disabled={loading}
                        style={{ padding: '10px 20px', background: '#007bff', color: 'white', border: 'none' }}
                    >
                        {loading ? 'Saving...' : (purchase ? 'Update' : 'Create')}
                    </button>
                    <button
                        type="button"
                        onClick={onCancel}
                        style={{ padding: '10px 20px', background: '#6c757d', color: 'white', border: 'none' }}
                    >
                        Cancel
                    </button>
                </div>
            </form>
        </div>
    );
};

export default PurchaseForm;