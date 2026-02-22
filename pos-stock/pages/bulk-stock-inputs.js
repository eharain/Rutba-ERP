import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import ProtectedRoute from '@rutba/pos-shared/components/ProtectedRoute';
import PermissionCheck from '@rutba/pos-shared/components/PermissionCheck';
import { authApi } from '@rutba/pos-shared/lib/api';
import { useUtil } from '@rutba/pos-shared/context/UtilContext';

const EMPTY_ROW = {
    productName: '',
    quantity: 1,
    sellableUnits: 1,
    costPrice: '',
    sellingPrice: '',
    offerPrice: '',
    supplierName: '',
    brandName: '',
    categoryName: '',
    orderId: '',
    supplierCode: '',
};

function newRow() {
    return { ...EMPTY_ROW, _key: Date.now() + Math.random() };
}

export default function BulkStockInputs() {
    const { currency } = useUtil();
    const [rows, setRows] = useState(() => Array.from({ length: 5 }, newRow));
    const [pending, setPending] = useState([]);
    const [brands, setBrands] = useState([]);
    const [categories, setCategories] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [saving, setSaving] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [alert, setAlert] = useState(null);
    const [loadingPending, setLoadingPending] = useState(false);

    // Load reference data and pending stock-inputs
    useEffect(() => {
        Promise.all([
            authApi.getAll('/brands'),
            authApi.getAll('/categories'),
            authApi.getAll('/suppliers'),
        ]).then(([b, c, s]) => {
            setBrands(b?.data || b || []);
            setCategories(c?.data || c || []);
            setSuppliers(s?.data || s || []);
        });
        loadPending();
    }, []);

    const loadPending = async () => {
        setLoadingPending(true);
        try {
            const res = await authApi.get('/stock-inputs', {
                filters: { processed: false },
                sort: ['createdAt:desc'],
                pagination: { pageSize: 200 },
            });
            setPending(res.data || []);
        } catch (err) {
            console.error('Failed to load pending stock inputs', err);
        } finally {
            setLoadingPending(false);
        }
    };

    const updateRow = useCallback((index, field, value) => {
        setRows((prev) => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };
            return next;
        });
    }, []);

    const addRows = (count = 5) => {
        setRows((prev) => [...prev, ...Array.from({ length: count }, newRow)]);
    };

    const removeRow = (index) => {
        setRows((prev) => prev.filter((_, i) => i !== index));
    };

    const clearRows = () => {
        setRows(Array.from({ length: 5 }, newRow));
    };

    const handleSave = async () => {
        const validRows = rows.filter((r) => r.productName && r.quantity > 0 && r.sellingPrice > 0);
        if (validRows.length === 0) {
            setAlert({ type: 'warning', message: 'No valid rows to save. Each row needs a product name, quantity > 0, and selling price > 0.' });
            return;
        }

        setSaving(true);
        setAlert(null);
        try {
            const payload = validRows.map((r) => ({
                productName: r.productName,
                quantity: Number(r.quantity) || 0,
                sellableUnits: Number(r.sellableUnits) || 1,
                costPrice: r.costPrice !== '' ? Number(r.costPrice) : null,
                sellingPrice: Number(r.sellingPrice) || 0,
                offerPrice: r.offerPrice !== '' ? Number(r.offerPrice) : null,
                supplierName: r.supplierName || null,
                brandName: r.brandName || null,
                categoryName: r.categoryName || null,
                orderId: r.orderId || null,
                supplierCode: r.supplierCode || null,
            }));

            const res = await authApi.post('/stock-inputs/bulk', { rows: payload });
            setAlert({ type: 'success', message: `${res.created || validRows.length} stock input(s) saved successfully.` });
            clearRows();
            await loadPending();
        } catch (err) {
            console.error('Save error:', err);
            setAlert({ type: 'danger', message: err?.response?.data?.error?.message || err.message || 'Failed to save stock inputs' });
        } finally {
            setSaving(false);
        }
    };

    const handleProcess = async (documentIds) => {
        setProcessing(true);
        setAlert(null);
        try {
            const body = documentIds ? { documentIds } : {};
            const res = await authApi.post('/stock-inputs/process', body);
            setAlert({
                type: res.failed > 0 ? 'warning' : 'success',
                message: `Processed ${res.processed} input(s): ${res.ok} succeeded, ${res.failed} failed.`,
            });
            await loadPending();
        } catch (err) {
            console.error('Process error:', err);
            setAlert({ type: 'danger', message: err?.response?.data?.error?.message || err.message || 'Failed to process stock inputs' });
        } finally {
            setProcessing(false);
        }
    };

    const handleDeletePending = async (documentId) => {
        try {
            await authApi.del(`/stock-inputs/${documentId}`);
            await loadPending();
        } catch (err) {
            console.error('Delete error:', err);
        }
    };

    const fields = [
        { key: 'productName', label: 'Product Name', type: 'text', required: true, width: '200px' },
        { key: 'quantity', label: 'Qty', type: 'number', required: true, width: '70px' },
        { key: 'sellableUnits', label: 'Sellable Units', type: 'number', width: '70px' },
        { key: 'costPrice', label: 'Cost Price', type: 'number', width: '100px' },
        { key: 'sellingPrice', label: 'Selling Price', type: 'number', required: true, width: '100px' },
        { key: 'offerPrice', label: 'Offer Price', type: 'number', width: '100px' },
        { key: 'supplierName', label: 'Supplier', type: 'text', datalist: suppliers.map((s) => s.name), width: '150px' },
        { key: 'brandName', label: 'Brand', type: 'text', datalist: brands.map((b) => b.name), width: '150px' },
        { key: 'categoryName', label: 'Category', type: 'text', datalist: categories.map((c) => c.name), width: '150px' },
        { key: 'orderId', label: 'Order / PO #', type: 'text', width: '120px' },
        { key: 'supplierCode', label: 'Supplier Code', type: 'text', width: '120px' },
    ];

    return (
        <ProtectedRoute>
            <PermissionCheck required="api::stock-input.stock-input.create">
                <Layout fullWidth>
                    <div className="container-fluid mt-3">
                        <h1><i className="fas fa-boxes me-2"></i>Bulk Stock Inputs</h1>
                        <p className="text-muted">Add multiple stock input rows and save them. Then process to create products, purchases and stock items.</p>

                        {alert && (
                            <div className={`alert alert-${alert.type} alert-dismissible fade show`} role="alert">
                                {alert.message}
                                <button type="button" className="btn-close" onClick={() => setAlert(null)}></button>
                            </div>
                        )}

                        {/* Bulk Entry Table */}
                        <div className="card mb-4">
                            <div className="card-header d-flex justify-content-between align-items-center">
                                <strong>New Stock Inputs</strong>
                                <div className="d-flex gap-2">
                                    <button className="btn btn-sm btn-outline-secondary" onClick={() => addRows(5)} title="Add 5 rows">
                                        <i className="fas fa-plus me-1"></i>Add Rows
                                    </button>
                                    <button className="btn btn-sm btn-outline-danger" onClick={clearRows} title="Clear all rows">
                                        <i className="fas fa-eraser me-1"></i>Clear
                                    </button>
                                </div>
                            </div>
                            <div className="card-body p-0">
                                <div className="table-responsive">
                                    <table className="table table-sm table-bordered table-hover mb-0">
                                        <thead className="table-light">
                                            <tr>
                                                <th style={{ width: '40px' }}>#</th>
                                                {fields.map((f) => (
                                                    <th key={f.key} style={{ minWidth: f.width }}>
                                                        {f.label}{f.required && <span className="text-danger">*</span>}
                                                    </th>
                                                ))}
                                                <th style={{ width: '50px' }}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rows.map((row, idx) => (
                                                <tr key={row._key}>
                                                    <td className="text-muted align-middle text-center">{idx + 1}</td>
                                                    {fields.map((f) => (
                                                        <td key={f.key} className="p-0">
                                                            <input
                                                                className="form-control form-control-sm border-0 rounded-0"
                                                                type={f.type}
                                                                value={row[f.key]}
                                                                onChange={(e) => updateRow(idx, f.key, e.target.value)}
                                                                list={f.datalist ? `dl-${f.key}` : undefined}
                                                                placeholder={f.label}
                                                                min={f.type === 'number' ? 0 : undefined}
                                                                step={f.type === 'number' ? 'any' : undefined}
                                                            />
                                                        </td>
                                                    ))}
                                                    <td className="align-middle text-center p-0">
                                                        <button className="btn btn-sm btn-link text-danger p-1" onClick={() => removeRow(idx)} title="Remove row">
                                                            <i className="fas fa-times"></i>
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Datalists for autocomplete */}
                                {fields.filter((f) => f.datalist).map((f) => (
                                    <datalist key={f.key} id={`dl-${f.key}`}>
                                        {f.datalist.map((opt, i) => (
                                            <option key={i} value={opt} />
                                        ))}
                                    </datalist>
                                ))}
                            </div>
                            <div className="card-footer d-flex justify-content-between align-items-center">
                                <small className="text-muted">
                                    {rows.filter((r) => r.productName && r.quantity > 0 && r.sellingPrice > 0).length} valid row(s) of {rows.length}
                                </small>
                                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                                    {saving ? <><span className="spinner-border spinner-border-sm me-1"></span>Saving...</> : <><i className="fas fa-save me-1"></i>Save All</>}
                                </button>
                            </div>
                        </div>

                        {/* Pending / Unprocessed Stock Inputs */}
                        <div className="card mb-4">
                            <div className="card-header d-flex justify-content-between align-items-center">
                                <strong>
                                    <i className="fas fa-clock me-1"></i>Pending Stock Inputs
                                    {pending.length > 0 && <span className="badge bg-warning text-dark ms-2">{pending.length}</span>}
                                </strong>
                                <div className="d-flex gap-2">
                                    <button className="btn btn-sm btn-outline-secondary" onClick={loadPending} disabled={loadingPending}>
                                        <i className="fas fa-sync-alt me-1"></i>Refresh
                                    </button>
                                    {pending.length > 0 && (
                                        <button className="btn btn-sm btn-success" onClick={() => handleProcess()} disabled={processing}>
                                            {processing
                                                ? <><span className="spinner-border spinner-border-sm me-1"></span>Processing...</>
                                                : <><i className="fas fa-cogs me-1"></i>Process All ({pending.length})</>}
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="card-body p-0">
                                {loadingPending ? (
                                    <div className="text-center py-4"><span className="spinner-border spinner-border-sm"></span> Loading...</div>
                                ) : pending.length === 0 ? (
                                    <div className="text-center text-muted py-4">No pending stock inputs.</div>
                                ) : (
                                    <div className="table-responsive">
                                        <table className="table table-sm table-bordered table-hover mb-0">
                                            <thead className="table-light">
                                                <tr>
                                                    <th>#</th>
                                                    <th>Product Name</th>
                                                    <th>Qty</th>
                                                    <th>Cost</th>
                                                    <th>Selling</th>
                                                    <th>Offer</th>
                                                    <th>Supplier</th>
                                                    <th>Brand</th>
                                                    <th>Category</th>
                                                    <th>Order #</th>
                                                    <th>Import</th>
                                                    <th>Created</th>
                                                    <th>Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {pending.map((si, idx) => (
                                                    <tr key={si.documentId || si.id}>
                                                        <td>{idx + 1}</td>
                                                        <td>{si.productName}</td>
                                                        <td>{si.quantity}</td>
                                                        <td>{si.costPrice != null ? `${currency}${si.costPrice}` : '-'}</td>
                                                        <td>{currency}{si.sellingPrice}</td>
                                                        <td>{si.offerPrice != null ? `${currency}${si.offerPrice}` : '-'}</td>
                                                        <td>{si.supplierName || '-'}</td>
                                                        <td>{si.brandName || '-'}</td>
                                                        <td>{si.categoryName || '-'}</td>
                                                        <td>{si.orderId || '-'}</td>
                                                        <td><small>{si.importName || '-'}</small></td>
                                                        <td><small>{si.createdAt ? new Date(si.createdAt).toLocaleDateString() : '-'}</small></td>
                                                        <td>
                                                            <div className="d-flex gap-1">
                                                                <button
                                                                    className="btn btn-sm btn-outline-success"
                                                                    onClick={() => handleProcess([si.documentId])}
                                                                    disabled={processing}
                                                                    title="Process this input"
                                                                >
                                                                    <i className="fas fa-cog"></i>
                                                                </button>
                                                                <button
                                                                    className="btn btn-sm btn-outline-danger"
                                                                    onClick={() => handleDeletePending(si.documentId)}
                                                                    title="Delete"
                                                                >
                                                                    <i className="fas fa-trash"></i>
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </Layout>
            </PermissionCheck>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() { return { props: {} }; }
