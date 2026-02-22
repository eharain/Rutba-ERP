import { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import Layout from '../components/Layout';
import ProtectedRoute from '@rutba/pos-shared/components/ProtectedRoute';
import PermissionCheck from '@rutba/pos-shared/components/PermissionCheck';
import { authApi } from '@rutba/pos-shared/lib/api';
import { useUtil } from '@rutba/pos-shared/context/UtilContext';

// ── Column mapping (mirrors export-catalog/utils/excel-helper.js) ──
const COLUMN_ALIASES = {
    productName: ['Products', 'Product', 'Title', 'Name', 'Item Name', 'Description', 'Item Description'],
    quantity: ['Quantity', 'Stock Quantity', 'Qty'],
    costPrice: ['Cost Price', 'Purchase Price', 'Cost'],
    sellingPrice: ['Selling Price', 'Sale Price', 'Sale', 'MRP'],
    supplierName: ['Suppliers', 'Supplier', 'Vendor', 'Seller'],
    brandName: ['Brands', 'Brand', 'Designer', 'Designed By'],
    categoryName: ['Categories', 'Category', 'Category Name'],
    orderId: ['Purchase Orders', 'Order', 'Purchase Order', 'PurchaseOrders', 'PurchaseOrder', 'Purchase NO', 'Purchase No', 'orderId', 'PO Number', 'PO', 'Order ID', 'Order id', 'Order Id'],
    supplierCode: ['Supplier Code', 'Seller Refference', 'Seller Ref', 'Ref', 'Code', 'Design Code'],
    importName: ['Import Name', 'File Name'],
    offerPrice: ['Offer Price', 'Discounted Price', 'Discount Price', 'Offer'],
    sellableUnits: ['Sellable Units', 'Sellable Unit', 'Sellable', 'Sellable Qty', 'Sellable Quantity'],
};

// Pre-expand every alias into many casing/separator variations
// (same logic as export-catalog/utils/excel-helper.js)
function buildVariations(label) {
    return [
        label,
        label.replaceAll(' ', '-').replaceAll('--', '-'),
        label.replaceAll(' ', '_').replaceAll('__', '_'),
        label.replaceAll(' ', '').replaceAll('  ', ''),
        label.replaceAll('_', ''),
        label.replaceAll('-', ''),
    ];
}

const EXPANDED_COLUMNS = {};
for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const all = new Set();
    for (const alias of aliases) {
        for (const v of buildVariations(alias)) all.add(v);
        for (const v of buildVariations(alias.toLowerCase())) all.add(v);
        for (const v of buildVariations(alias.toUpperCase())) all.add(v);
        for (const v of buildVariations(field)) all.add(v);
        for (const v of buildVariations(field.toLowerCase())) all.add(v);
        for (const v of buildVariations(field.toUpperCase())) all.add(v);
    }
    EXPANDED_COLUMNS[field] = [...all];
}

function resolveColumn(row, possibleNames) {
    for (const name of possibleNames) {
        if (Object.prototype.hasOwnProperty.call(row, name)) {
            return row[name];
        }
    }
    return undefined;
}

function parseExcelRows(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const wb = XLSX.read(e.target.result, { type: 'array' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const jsonRows = XLSX.utils.sheet_to_json(ws, { defval: '' });
                if (!jsonRows || jsonRows.length === 0) {
                    return resolve([]);
                }

                const mapped = jsonRows.map((row) => {
                    const record = {};
                    for (const [field, possibleNames] of Object.entries(EXPANDED_COLUMNS)) {
                        const val = resolveColumn(row, possibleNames);
                        record[field] = (val !== '' && val != null) ? val : EMPTY_ROW[field];
                    }
                    record._key = Date.now() + Math.random();
                    record.importName = file.name;
                    return record;
                });
                resolve(mapped);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsArrayBuffer(file);
    });
}

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
    const [uploading, setUploading] = useState(false);
    const [uploadFileName, setUploadFileName] = useState('');
    const [selected, setSelected] = useState(new Set());
    const [activeTab, setActiveTab] = useState('pending');
    const fileInputRef = useRef(null);

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
        setUploadFileName('');
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        setAlert(null);
        try {
            const parsed = await parseExcelRows(file);
            if (parsed.length === 0) {
                setAlert({ type: 'warning', message: 'No rows found in the Excel file.' });
                return;
            }
            // Replace empty starter rows, or append to existing data
            const hasData = rows.some((r) => r.productName);
            if (hasData) {
                setRows((prev) => [...prev, ...parsed]);
            } else {
                setRows(parsed);
            }
            setUploadFileName(file.name);
            setAlert({ type: 'info', message: `Loaded ${parsed.length} row(s) from "${file.name}". Review and edit below, then click Save All.` });
        } catch (err) {
            console.error('Excel parse error:', err);
            setAlert({ type: 'danger', message: 'Failed to parse Excel file: ' + (err.message || err) });
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleSave = async () => {
        const validRows = rows.filter((r) => r.productName && r.quantity > 0 && r.sellingPrice > 0);
        if (validRows.length === 0) {
            setAlert({ type: 'warning', message: 'No valid rows to save. Each row needs a product name, quantity > 0, and selling price > 0.' });
            return;
        }

        const toNum = (v) => { const n = Number(v); return (v === '' || v == null || isNaN(n)) ? null : n; };

        setSaving(true);
        setAlert(null);
        let created = 0;
        let failed = 0;
        const errors = [];
        for (const r of validRows) {
            try {
                await authApi.post('/stock-inputs', {
                    data: {
                        productName: String(r.productName).trim(),
                        quantity: toNum(r.quantity) || 1,
                        sellableUnits: toNum(r.sellableUnits) || 1,
                        costPrice: toNum(r.costPrice),
                        sellingPrice: toNum(r.sellingPrice) || 0,
                        offerPrice: toNum(r.offerPrice),
                        supplierName: r.supplierName ? String(r.supplierName).trim() : null,
                        brandName: r.brandName ? String(r.brandName).trim() : null,
                        categoryName: r.categoryName ? String(r.categoryName).trim() : null,
                        orderId: r.orderId ? String(r.orderId).trim() : null,
                        supplierCode: r.supplierCode ? String(r.supplierCode).trim() : null,
                        importName: r.importName || null,
                        process: false,
                        processed: false,
                    },
                });
                created++;
            } catch (err) {
                failed++;
                const msg = err?.response?.data?.error?.message || err.message || 'Unknown error';
                errors.push(`Row "${r.productName}": ${msg}`);
                console.error('Save row error:', r.productName, msg);
            }
        }
        if (failed > 0) {
            setAlert({ type: 'warning', message: `Saved ${created} of ${validRows.length}. ${failed} failed:\n${errors.join('\n')}` });
        } else {
            setAlert({ type: 'success', message: `${created} stock input(s) saved successfully.` });
        }
        if (created > 0) {
            clearRows();
            await loadPending();
        }
        setSaving(false);
    };

    const handleProcess = async (documentIds) => {
        setProcessing(true);
        setAlert(null);
        try {
            const body = documentIds ? { data: { documentIds } } : {};
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

    const handleToggleProcess = async (documentId, currentValue) => {
        try {
            await authApi.put(`/stock-inputs/${documentId}`, { data: { process: !currentValue } });
            setPending((prev) => prev.map((si) =>
                si.documentId === documentId ? { ...si, process: !currentValue } : si
            ));
        } catch (err) {
            console.error('Toggle error:', err);
        }
    };

    const handleMarkSelectedForProcess = async (markAs) => {
        if (selected.size === 0) return;
        for (const docId of selected) {
            try {
                await authApi.put(`/stock-inputs/${docId}`, { data: { process: markAs } });
            } catch (err) {
                console.error('Mark error for', docId, err);
            }
        }
        setPending((prev) => prev.map((si) =>
            selected.has(si.documentId) ? { ...si, process: markAs } : si
        ));
    };

    const handleDeletePending = async (documentId) => {
        try {
            await authApi.del(`/stock-inputs/${documentId}`);
            setSelected((prev) => { const next = new Set(prev); next.delete(documentId); return next; });
            await loadPending();
        } catch (err) {
            console.error('Delete error:', err);
        }
    };

    const handleDeleteSelected = async () => {
        if (selected.size === 0) return;
        if (!confirm(`Delete ${selected.size} stock input(s)?`)) return;
        setAlert(null);
        let deleted = 0;
        for (const docId of selected) {
            try {
                await authApi.del(`/stock-inputs/${docId}`);
                deleted++;
            } catch (err) {
                console.error('Delete error for', docId, err);
            }
        }
        setSelected(new Set());
        setAlert({ type: 'success', message: `Deleted ${deleted} stock input(s).` });
        await loadPending();
    };

    const handleDeleteAll = async () => {
        if (pending.length === 0) return;
        if (!confirm(`Delete ALL ${pending.length} unprocessed stock inputs?`)) return;
        setAlert(null);
        let deleted = 0;
        for (const si of pending) {
            try {
                await authApi.del(`/stock-inputs/${si.documentId}`);
                deleted++;
            } catch (err) {
                console.error('Delete error for', si.documentId, err);
            }
        }
        setSelected(new Set());
        setAlert({ type: 'success', message: `Deleted ${deleted} stock input(s).` });
        await loadPending();
    };

    const handleProcessSelected = async () => {
        if (selected.size === 0) return;
        await handleProcess([...selected]);
        setSelected(new Set());
    };

    const toggleSelect = (docId) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(docId)) next.delete(docId); else next.add(docId);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selected.size === pending.length) {
            setSelected(new Set());
        } else {
            setSelected(new Set(pending.map((si) => si.documentId)));
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

                        {/* Tab navigation */}
                        <ul className="nav nav-tabs mb-3">
                            <li className="nav-item">
                                <button className={`nav-link ${activeTab === 'pending' ? 'active' : ''}`} onClick={() => setActiveTab('pending')}>
                                    <i className="fas fa-clock me-1"></i>Pending
                                    {pending.length > 0 && <span className="badge bg-warning text-dark ms-1">{pending.length}</span>}
                                </button>
                            </li>
                            <li className="nav-item">
                                <button className={`nav-link ${activeTab === 'add' ? 'active' : ''}`} onClick={() => setActiveTab('add')}>
                                    <i className="fas fa-plus-circle me-1"></i>Add New
                                </button>
                            </li>
                        </ul>

                        {/* ═══════════ Pending / Unprocessed Tab ═══════════ */}
                        {activeTab === 'pending' && (
                        <div className="card mb-4">
                            <div className="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
                                <strong>
                                    <i className="fas fa-clock me-1"></i>Unprocessed Stock Inputs
                                    {pending.length > 0 && <span className="badge bg-secondary ms-2">{pending.length}</span>}
                                    {pending.filter((si) => si.process).length > 0 && (
                                        <span className="badge bg-success ms-1" title="Marked ready to process">
                                            <i className="fas fa-check me-1"></i>{pending.filter((si) => si.process).length} ready
                                        </span>
                                    )}
                                </strong>
                                <div className="d-flex gap-2 flex-wrap">
                                    <button className="btn btn-sm btn-outline-secondary" onClick={loadPending} disabled={loadingPending}>
                                        <i className="fas fa-sync-alt me-1"></i>Refresh
                                    </button>
                                    {selected.size > 0 && (
                                        <>
                                            <button className="btn btn-sm btn-outline-info" onClick={() => handleMarkSelectedForProcess(true)} title="Mark selected as ready to process">
                                                <i className="fas fa-toggle-on me-1"></i>Mark Ready ({selected.size})
                                            </button>
                                            <button className="btn btn-sm btn-outline-secondary" onClick={() => handleMarkSelectedForProcess(false)} title="Unmark selected">
                                                <i className="fas fa-toggle-off me-1"></i>Unmark ({selected.size})
                                            </button>
                                            <button className="btn btn-sm btn-outline-danger" onClick={handleDeleteSelected}>
                                                <i className="fas fa-trash me-1"></i>Delete ({selected.size})
                                            </button>
                                            <button className="btn btn-sm btn-success" onClick={handleProcessSelected} disabled={processing}>
                                                {processing
                                                    ? <><span className="spinner-border spinner-border-sm me-1"></span>Processing...</>
                                                    : <><i className="fas fa-cogs me-1"></i>Process Selected ({selected.size})</>}
                                            </button>
                                        </>
                                    )}
                                    {pending.filter((si) => si.process).length > 0 && selected.size === 0 && (
                                        <button className="btn btn-sm btn-success" onClick={() => handleProcess()} disabled={processing}>
                                            {processing
                                                ? <><span className="spinner-border spinner-border-sm me-1"></span>Processing...</>
                                                : <><i className="fas fa-cogs me-1"></i>Process Ready ({pending.filter((si) => si.process).length})</>}
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="card-body p-0">
                                {loadingPending ? (
                                    <div className="text-center py-4"><span className="spinner-border spinner-border-sm"></span> Loading...</div>
                                ) : pending.length === 0 ? (
                                    <div className="text-center text-muted py-4">
                                        No unprocessed stock inputs.
                                        <button className="btn btn-sm btn-link" onClick={() => setActiveTab('add')}>Add new entries</button>
                                    </div>
                                ) : (
                                    <div className="table-responsive">
                                        <table className="table table-sm table-bordered table-hover mb-0">
                                            <thead className="table-light">
                                                <tr>
                                                    <th style={{ width: '40px' }}>
                                                        <input
                                                            type="checkbox"
                                                            className="form-check-input"
                                                            checked={pending.length > 0 && selected.size === pending.length}
                                                            onChange={toggleSelectAll}
                                                        />
                                                    </th>
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
                                                    <th className="text-center">Ready</th>
                                                    <th>Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {pending.map((si, idx) => (
                                                    <tr key={si.documentId || si.id} className={selected.has(si.documentId) ? 'table-active' : ''}>
                                                        <td className="align-middle text-center">
                                                            <input
                                                                type="checkbox"
                                                                className="form-check-input"
                                                                checked={selected.has(si.documentId)}
                                                                onChange={() => toggleSelect(si.documentId)}
                                                            />
                                                        </td>
                                                        <td>{idx + 1}</td>
                                                        <td>{si.productName}</td>
                                                        <td>{si.quantity}</td>
                                                        <td>{si.costPrice != null ? <>{currency}{si.costPrice}</> : '-'}</td>
                                                        <td>{currency}{si.sellingPrice}</td>
                                                        <td>{si.offerPrice != null ? <>{currency}{si.offerPrice}</> : '-'}</td>
                                                        <td>{si.supplierName || '-'}</td>
                                                        <td>{si.brandName || '-'}</td>
                                                        <td>{si.categoryName || '-'}</td>
                                                        <td>{si.orderId || '-'}</td>
                                                        <td><small>{si.importName || '-'}</small></td>
                                                        <td className="align-middle text-center">
                                                            <div className="form-check form-switch d-flex justify-content-center mb-0">
                                                                <input
                                                                    type="checkbox"
                                                                    className="form-check-input"
                                                                    role="switch"
                                                                    checked={!!si.process}
                                                                    onChange={() => handleToggleProcess(si.documentId, si.process)}
                                                                    title={si.process ? 'Marked ready — click to unmark' : 'Not ready — click to mark for processing'}
                                                                />
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <div className="d-flex gap-1">
                                                                <button
                                                                    className="btn btn-sm btn-outline-success"
                                                                    onClick={() => handleProcess([si.documentId])}
                                                                    disabled={processing}
                                                                    title="Process this input now"
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
                            {pending.length > 0 && (
                                <div className="card-footer d-flex justify-content-between align-items-center">
                                    <small className="text-muted">
                                        {selected.size > 0
                                            ? `${selected.size} of ${pending.length} selected`
                                            : `${pending.length} unprocessed — ${pending.filter((si) => si.process).length} marked ready`}
                                    </small>
                                    {pending.length > 1 && (
                                        <button
                                            className="btn btn-sm btn-outline-danger"
                                            onClick={handleDeleteAll}
                                        >
                                            <i className="fas fa-trash-alt me-1"></i>Delete All Pending
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                        )}

                        {/* ═══════════ Add New Tab ═══════════ */}
                        {activeTab === 'add' && (
                        <>
                        {/* Excel Upload */}
                        <div className="card mb-4">
                            <div className="card-header">
                                <strong><i className="fas fa-file-excel me-1"></i>Import from Excel</strong>
                            </div>
                            <div className="card-body">
                                <div className="row align-items-center">
                                    <div className="col-auto">
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            className="form-control form-control-sm"
                                            accept=".xlsx,.xls,.csv"
                                            onChange={handleFileUpload}
                                            disabled={uploading}
                                        />
                                    </div>
                                    <div className="col-auto">
                                        {uploading && <span className="spinner-border spinner-border-sm me-1"></span>}
                                        {uploadFileName && <span className="badge bg-info text-dark"><i className="fas fa-file me-1"></i>{uploadFileName}</span>}
                                    </div>
                                    <div className="col">
                                        <small className="text-muted">
                                            Upload an Excel file (.xlsx / .xls) or CSV. The first sheet is read and columns are auto-mapped
                                            (Title → Product Name, Quantity / Qty, Cost Price, Selling Price / MRP, Supplier, Brand, Category, PO, etc.).
                                            Rows load into the form below for review before saving.
                                        </small>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Bulk Entry Table */}
                        <div className="card mb-4">
                            <div className="card-header d-flex justify-content-between align-items-center">
                                <strong>New Stock Inputs{rows.some((r) => r.productName) ? ` (${rows.filter((r) => r.productName).length} rows)` : ''}</strong>
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
                        </>)
                        }
                    </div>
                </Layout>
            </PermissionCheck>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() { return { props: {} }; }
