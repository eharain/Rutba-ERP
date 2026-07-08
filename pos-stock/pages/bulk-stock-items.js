import { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import Layout from '../components/Layout';
import ProductPickerModal from '../components/ProductPickerModal';
import ProtectedRoute from '@rutba/pos-shared/components/ProtectedRoute';
import PermissionCheck from '@rutba/pos-shared/components/PermissionCheck';
import ListPageLayout from '@rutba/pos-shared/components/ListPageLayout';
import { StockItemsEndpoints } from '@rutba/api-provider/endpoints/index.js';
import { printStorage } from '@rutba/pos-shared/lib/printStorage';

// ── Column mapping for Excel import (extends the bulk-stock-inputs approach) ──
const COLUMN_ALIASES = {
    productName: ['Product', 'Product Name', 'Products', 'Title', 'Name', 'Item Name', 'Description'],
    stockItemName: ['Stock Item Name', 'Stock Item', 'Item Label', 'Label', 'Unit Name'],
    barcode: ['Barcode', 'Product Barcode', 'Manufacturer Barcode', 'Bar Code', 'EAN', 'UPC', 'Bar-code'],
    sku: ['SKU', 'Sku', 'Stock Code', 'Product Code', 'Article', 'Article Code'],
    quantity: ['Quantity', 'Stock Quantity', 'Qty', 'Units'],
    barcodeMode: ['Barcode Mode', 'Mode', 'Bc Mode', 'Barcode Type'],
    updateExisting: ['Update Existing', 'Update', 'Overwrite', 'Upsert'],
    createNewProduct: ['Create New Product', 'Create New', 'New Product', 'Duplicate'],
    newProductName: ['New Product Name', 'Duplicate Name', 'New Name'],
    manufacturerName: ['Manufacturer', 'Manufacturer Name', 'Maker', 'Mfr', 'Mfg'],
    productDocumentId: ['Product DocumentId', 'DocumentId', 'Product Id', 'Product ID'],
    costPrice: ['Cost Price', 'Purchase Price', 'Cost'],
    sellingPrice: ['Selling Price', 'Sale Price', 'MRP', 'Price'],
    offerPrice: ['Offer Price', 'Discounted Price', 'Discount Price', 'Offer'],
};

// Canonical headers + a couple of sample rows for the downloadable template.
const TEMPLATE_HEADERS = [
    'Product Name', 'Stock Item Name', 'Product Barcode', 'SKU', 'Quantity',
    'Barcode Mode', 'Update Existing', 'Create New Product', 'New Product Name',
    'Manufacturer', 'Cost Price', 'Selling Price', 'Offer Price',
];
const TEMPLATE_SAMPLES = [
    { 'Product Name': 'Acme Kettle 1.5L', 'Product Barcode': '8901234567890', 'SKU': 'KTL-15', 'Quantity': 3, 'Barcode Mode': 'manufacturer', 'Manufacturer': 'Acme Corp' },
    { 'Product Name': 'Steel Mug', 'Product Barcode': '', 'SKU': 'MUG-STL', 'Quantity': 10, 'Barcode Mode': 'indexed', 'Selling Price': 450 },
    { 'Product Name': 'Steel Mug (Blue Edition)', 'Quantity': 5, 'Barcode Mode': 'auto', 'Create New Product': 'yes', 'New Product Name': 'Steel Mug Blue', 'Selling Price': 500 },
];

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
    }
    EXPANDED_COLUMNS[field] = [...all];
}

function resolveColumn(row, possibleNames) {
    for (const name of possibleNames) {
        if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];
    }
    return undefined;
}

const BOOL_FIELDS = new Set(['updateExisting', 'createNewProduct']);

function truthy(v) {
    if (v === true) return true;
    if (typeof v === 'number') return v === 1;
    const s = (v ?? '').toString().trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'yes' || s === 'y' || s === 'x' || s === 'on';
}

function normalizeMode(raw) {
    const s = (raw ?? '').toString().trim().toLowerCase();
    if (s.includes('index')) return 'indexed';
    if (s.includes('distinct') || s.includes('exact') || s.includes('single') || s.includes('one')) return 'distinct';
    if (s.includes('auto') || s.includes('new') || s.includes('generat')) return 'auto';
    if (s.includes('share') || s.includes('same')) return 'indexed';
    return '';
}

const EMPTY_ROW = {
    productName: '',
    stockItemName: '',
    barcode: '',
    sku: '',
    quantity: 1,
    barcodeMode: 'indexed',
    updateExisting: false,
    createNewProduct: false,
    newProductName: '',
    manufacturerName: '',
    productDocumentId: '',
    costPrice: '',
    sellingPrice: '',
    offerPrice: '',
};

function newRow(overrides = {}) {
    return { ...EMPTY_ROW, ...overrides, _key: `${Date.now()}-${Math.random()}` };
}

function rowIsBlank(r) {
    return !((r.productName || '').trim() || (r.barcode || '').trim() || (r.sku || '').trim() ||
        (r.productDocumentId || '').trim() || r.createNewProduct);
}

function parseExcelRows(file, defaultMode) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const wb = XLSX.read(e.target.result, { type: 'array' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const jsonRows = XLSX.utils.sheet_to_json(ws, { defval: '' });
                if (!jsonRows || jsonRows.length === 0) return resolve([]);

                const mapped = jsonRows.map((row) => {
                    const record = {};
                    for (const [field, possibleNames] of Object.entries(EXPANDED_COLUMNS)) {
                        const val = resolveColumn(row, possibleNames);
                        if (BOOL_FIELDS.has(field)) {
                            record[field] = val === undefined || val === '' ? EMPTY_ROW[field] : truthy(val);
                        } else if (field === 'barcodeMode') {
                            record[field] = normalizeMode(val) || defaultMode || 'indexed';
                        } else {
                            record[field] = (val !== '' && val != null) ? val : EMPTY_ROW[field];
                        }
                    }
                    return newRow(record);
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

const MODE_OPTIONS = [
    { value: 'indexed', label: 'Indexed (base + 001…)' },
    { value: 'auto', label: 'Auto-generate' },
    { value: 'distinct', label: 'Distinct (exact, qty 1)' },
    { value: 'product', label: 'Manufacturer/EAN (product only)' },
];

const MODE_LABEL = Object.fromEntries(MODE_OPTIONS.map((o) => [o.value, o.label]));

export default function BulkStockItems() {
    const [stage, setStage] = useState('entry'); // 'entry' | 'review' | 'done'
    const [rows, setRows] = useState(() => Array.from({ length: 5 }, () => newRow()));
    const [review, setReview] = useState([]);
    const [results, setResults] = useState(null);
    const [createdIds, setCreatedIds] = useState([]);

    const [masterMode, setMasterMode] = useState('indexed');
    const [masterUpdate, setMasterUpdate] = useState(false);

    const [alert, setAlert] = useState(null);
    const [resolving, setResolving] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadFileName, setUploadFileName] = useState('');
    const [pickerRow, setPickerRow] = useState(null); // index of review row picking a product
    const fileInputRef = useRef(null);

    // ── Entry-stage row editing ──────────────────────────────────────────────
    const updateRow = useCallback((index, field, value) => {
        setRows((prev) => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };
            return next;
        });
    }, []);

    const addRows = (count = 5) => setRows((prev) => [...prev, ...Array.from({ length: count }, () => newRow({ barcodeMode: masterMode, updateExisting: masterUpdate }))]);
    const removeRow = (index) => setRows((prev) => prev.filter((_, i) => i !== index));
    const clearRows = () => { setRows(Array.from({ length: 5 }, () => newRow({ barcodeMode: masterMode }))); setUploadFileName(''); };

    const applyMasterMode = (mode) => {
        setMasterMode(mode);
        setRows((prev) => prev.map((r) => ({ ...r, barcodeMode: mode })));
    };
    const applyMasterUpdate = (val) => {
        setMasterUpdate(val);
        setRows((prev) => prev.map((r) => ({ ...r, updateExisting: val })));
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        setAlert(null);
        try {
            const parsed = await parseExcelRows(file, masterMode);
            if (parsed.length === 0) {
                setAlert({ type: 'warning', message: 'No rows found in the Excel file.' });
                return;
            }
            const hasData = rows.some((r) => !rowIsBlank(r));
            if (hasData) {
                setRows((prev) => [...prev.filter((r) => !rowIsBlank(r)), ...parsed]);
            } else {
                setRows(parsed);
            }
            setUploadFileName(file.name);
            setAlert({ type: 'info', message: `Loaded ${parsed.length} row(s) from "${file.name}". Review and edit below, then Match & Review.` });
        } catch (err) {
            console.error('Excel parse error:', err);
            setAlert({ type: 'danger', message: 'Failed to parse Excel file: ' + (err.message || err) });
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // ── Stage 1 → 2 : resolve ────────────────────────────────────────────────
    const handleResolve = async () => {
        const entryRows = rows.filter((r) => !rowIsBlank(r));
        if (entryRows.length === 0) {
            setAlert({ type: 'warning', message: 'Add at least one row (a product name, barcode, sku, or "create new product").' });
            return;
        }
        setResolving(true);
        setAlert(null);
        try {
            const payload = entryRows.map((r) => ({
                productName: (r.productName || '').trim(),
                productDocumentId: (r.productDocumentId || '').trim() || undefined,
                barcode: (r.barcode || '').trim(),
                sku: (r.sku || '').trim(),
                quantity: Number(r.quantity) || 1,
                barcodeMode: r.barcodeMode || masterMode,
                createNewProduct: !!r.createNewProduct,
                newProductName: (r.newProductName || '').trim(),
                manufacturerName: (r.manufacturerName || '').trim(),
            }));
            const res = await StockItemsEndpoints.resolveBulkStock(payload);
            const plans = res?.rows || [];
            const reviewRows = entryRows.map((r, i) => {
                const plan = plans[i] || {};
                let decisionDocId = (r.productDocumentId || '').trim();
                let createNew = !!r.createNewProduct;
                let newName = (r.newProductName || '').trim();
                let productLabel = '';
                if (plan.matchType === 'id' || plan.matchType === 'name-exact') {
                    decisionDocId = plan.productMatch?.documentId || decisionDocId;
                    productLabel = plan.productMatch?.name || '';
                } else if (plan.matchType === 'create-new') {
                    createNew = true;
                    newName = newName || (r.productName || '').trim();
                }
                return { ...r, plan, decisionDocId, createNew, newName, productLabel };
            });
            setReview(reviewRows);
            setStage('review');
            const s = res?.summary || {};
            setAlert({
                type: (s.needProduct || s.ambiguous) ? 'info' : 'success',
                message: `Resolved ${reviewRows.length} row(s).` +
                    (s.ambiguous ? ` ${s.ambiguous} need a product choice.` : '') +
                    (s.needProduct ? ` ${s.needProduct} have no match — pick a product or create new.` : ''),
            });
        } catch (err) {
            console.error('Resolve error:', err);
            setAlert({ type: 'danger', message: err?.response?.data?.error?.message || err.message || 'Failed to resolve rows' });
        } finally {
            setResolving(false);
        }
    };

    // ── Review-stage row editing ─────────────────────────────────────────────
    const updateReviewRow = (index, patch) => {
        setReview((prev) => {
            const next = [...prev];
            next[index] = { ...next[index], ...patch };
            return next;
        });
    };

    const onPickProduct = (documentId, product) => {
        if (pickerRow == null || !documentId) { setPickerRow(null); return; }
        updateReviewRow(pickerRow, {
            decisionDocId: documentId,
            productLabel: product?.name || `Selected (${documentId})`,
            createNew: false,
            plan: { ...(review[pickerRow]?.plan || {}), matchType: 'id' },
        });
        setPickerRow(null);
    };

    const rowReady = (rr) => (rr.createNew ? !!(rr.newName || '').trim() : !!rr.decisionDocId);

    // ── Stage 2 → 3 : process ────────────────────────────────────────────────
    const handleProcess = async () => {
        const readyRows = review.filter(rowReady);
        const skipped = review.length - readyRows.length;
        if (readyRows.length === 0) {
            setAlert({ type: 'warning', message: 'No rows are ready — each row needs a matched product or a new-product name.' });
            return;
        }
        setProcessing(true);
        setAlert(null);
        try {
            const payload = readyRows.map((rr) => ({
                productName: (rr.productName || '').trim(),
                productDocumentId: rr.createNew ? undefined : rr.decisionDocId,
                createNewProduct: !!rr.createNew,
                newProductName: rr.createNew ? (rr.newName || '').trim() : undefined,
                name: (rr.stockItemName || '').trim() || undefined,
                barcode: (rr.barcode || '').trim(),
                sku: (rr.sku || '').trim(),
                quantity: Number(rr.quantity) || 1,
                barcodeMode: rr.barcodeMode || masterMode,
                updateExisting: !!rr.updateExisting,
                manufacturerName: (rr.manufacturerName || '').trim(),
                costPrice: rr.costPrice,
                sellingPrice: rr.sellingPrice,
                offerPrice: rr.offerPrice,
            }));
            const res = await StockItemsEndpoints.processBulkStock(payload);
            setResults(res);
            setCreatedIds(res?.createdStockItemDocumentIds || []);
            setStage('done');
            setAlert({
                type: res.failed > 0 ? 'warning' : 'success',
                message: `Processed ${res.processed} row(s): ${res.ok} ok, ${res.failed} failed.` +
                    (skipped ? ` ${skipped} unresolved row(s) skipped.` : ''),
            });
        } catch (err) {
            console.error('Process error:', err);
            setAlert({ type: 'danger', message: err?.response?.data?.error?.message || err.message || 'Failed to process import' });
        } finally {
            setProcessing(false);
        }
    };

    const downloadTemplate = () => {
        const ws = XLSX.utils.json_to_sheet(TEMPLATE_SAMPLES, { header: TEMPLATE_HEADERS });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'StockItems');
        XLSX.writeFile(wb, 'stock-items-import-template.xlsx');
    };

    const handlePrintLabels = () => {
        if (!createdIds.length) return;
        const storageKey = printStorage.storePrintData({ documentIds: createdIds, timestamp: Date.now() });
        if (!storageKey) return;
        const title = encodeURIComponent(`Bulk Stock Labels - ${createdIds.length} Items`);
        window.open(`/print-bulk-barcodes?key=${storageKey}&title=${title}`, '_blank', 'width=1200,height=800');
    };

    const resetAll = () => {
        setStage('entry');
        setRows(Array.from({ length: 5 }, () => newRow({ barcodeMode: masterMode })));
        setReview([]);
        setResults(null);
        setCreatedIds([]);
        setUploadFileName('');
        setAlert(null);
    };

    // ── Entry-stage column definitions ───────────────────────────────────────
    const entryFields = [
        { key: 'productName', label: 'Product Name', type: 'text', width: '190px' },
        { key: 'stockItemName', label: 'Stock Item Name', type: 'text', width: '150px' },
        { key: 'barcode', label: 'Product / Mfr Barcode', type: 'text', width: '150px' },
        { key: 'sku', label: 'SKU', type: 'text', width: '120px' },
        { key: 'manufacturerName', label: 'Manufacturer', type: 'text', width: '130px' },
        { key: 'quantity', label: 'Qty', type: 'number', width: '70px' },
        { key: 'costPrice', label: 'Cost', type: 'number', width: '90px' },
        { key: 'sellingPrice', label: 'Selling', type: 'number', width: '90px' },
        { key: 'offerPrice', label: 'Offer', type: 'number', width: '90px' },
    ];

    const validCount = rows.filter((r) => !rowIsBlank(r)).length;
    const readyCount = review.filter(rowReady).length;

    return (
        <ProtectedRoute>
            <PermissionCheck required="stock">
                <Layout>
                    <ListPageLayout
                        title={<h4 className="mb-0"><i className="fas fa-barcode me-2"></i>Stock Items Import</h4>}
                        subtitle="Bulk-create or update stock items by barcode / SKU. Enter or import rows, review & match products, then process."
                    >
                        <div className="p-3">
                            {alert && (
                                <div className={`alert alert-${alert.type} alert-dismissible fade show`} role="alert" style={{ whiteSpace: 'pre-line' }}>
                                    {alert.message}
                                    <button type="button" className="btn-close" onClick={() => setAlert(null)}></button>
                                </div>
                            )}

                            {/* Stepper */}
                            <ul className="nav nav-pills mb-3 small">
                                <li className="nav-item"><span className={`nav-link ${stage === 'entry' ? 'active' : ''}`}><i className="fas fa-pen me-1"></i>1. Enter / Import</span></li>
                                <li className="nav-item"><span className={`nav-link ${stage === 'review' ? 'active' : ''}`}><i className="fas fa-magnifying-glass me-1"></i>2. Review & Match</span></li>
                                <li className="nav-item"><span className={`nav-link ${stage === 'done' ? 'active' : ''}`}><i className="fas fa-check me-1"></i>3. Result</span></li>
                            </ul>

                            {/* ═══════════ Stage 1 — Entry ═══════════ */}
                            {stage === 'entry' && (
                            <>
                                <PermissionCheck showIf="admin">
                                    <div className="card mb-3">
                                        <div className="card-header d-flex justify-content-between align-items-center">
                                            <strong><i className="fas fa-file-excel me-1"></i>Import from Excel</strong>
                                            <button className="btn btn-sm btn-outline-success" onClick={downloadTemplate}>
                                                <i className="fas fa-download me-1"></i>Download Template
                                            </button>
                                        </div>
                                        <div className="card-body">
                                            <div className="row align-items-center g-2 mb-2">
                                                <div className="col-auto">
                                                    <input ref={fileInputRef} type="file" className="form-control form-control-sm"
                                                        accept=".xlsx,.xls,.csv" onChange={handleFileUpload} disabled={uploading} />
                                                </div>
                                                <div className="col-auto">
                                                    {uploading && <span className="spinner-border spinner-border-sm me-1"></span>}
                                                    {uploadFileName && <span className="badge bg-info text-dark"><i className="fas fa-file me-1"></i>{uploadFileName}</span>}
                                                </div>
                                            </div>
                                            <details>
                                                <summary className="small text-muted" style={{ cursor: 'pointer' }}>Accepted column headers (first sheet, order-independent)</summary>
                                                <div className="small text-muted mt-2">
                                                    <table className="table table-sm table-bordered mb-2" style={{ maxWidth: '760px' }}>
                                                        <tbody>
                                                            <tr><td><code>Product Name</code></td><td>Match an existing product by name (case-insensitive).</td></tr>
                                                            <tr><td><code>Stock Item Name</code></td><td>Optional label for the stock item(s); defaults to product name.</td></tr>
                                                            <tr><td><code>Product Barcode</code> / <code>Manufacturer Barcode</code> / <code>EAN</code></td><td>The barcode. In <em>Manufacturer/EAN</em> mode it's stored on the product.</td></tr>
                                                            <tr><td><code>SKU</code></td><td>Product SKU; also copied to each stock item (shared).</td></tr>
                                                            <tr><td><code>Quantity</code></td><td>How many stock items to create (ignored in Manufacturer/EAN mode).</td></tr>
                                                            <tr><td><code>Barcode Mode</code></td><td><code>indexed</code> · <code>auto</code> · <code>distinct</code> · <code>manufacturer</code>/<code>ean</code>.</td></tr>
                                                            <tr><td><code>Update Existing</code></td><td><code>yes/no</code> — overwrite a stock item whose barcode already exists.</td></tr>
                                                            <tr><td><code>Create New Product</code> + <code>New Product Name</code></td><td><code>yes</code> to make a duplicate product with the given name.</td></tr>
                                                            <tr><td><code>Manufacturer</code></td><td>Maker name (added to product keywords in Manufacturer/EAN mode).</td></tr>
                                                            <tr><td><code>Cost Price</code> · <code>Selling Price</code> · <code>Offer Price</code></td><td>Optional prices.</td></tr>
                                                        </tbody>
                                                    </table>
                                                    Rows load into the grid below for review before anything is written.
                                                </div>
                                            </details>
                                        </div>
                                    </div>
                                </PermissionCheck>

                                <div className="card mb-3">
                                    <div className="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
                                        <strong>New Rows{validCount ? ` (${validCount})` : ''}</strong>
                                        <div className="d-flex align-items-center gap-2 flex-wrap">
                                            <div className="input-group input-group-sm" style={{ width: 'auto' }}>
                                                <span className="input-group-text">Barcode mode</span>
                                                <select className="form-select form-select-sm" value={masterMode} onChange={(e) => applyMasterMode(e.target.value)} style={{ width: '180px' }}>
                                                    {MODE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                                </select>
                                            </div>
                                            <div className="form-check form-switch mb-0">
                                                <input className="form-check-input" type="checkbox" role="switch" id="masterUpdate"
                                                    checked={masterUpdate} onChange={(e) => applyMasterUpdate(e.target.checked)} />
                                                <label className="form-check-label small" htmlFor="masterUpdate">Update existing (all)</label>
                                            </div>
                                            <button className="btn btn-sm btn-outline-secondary" onClick={() => addRows(5)}><i className="fas fa-plus me-1"></i>Add Rows</button>
                                            <button className="btn btn-sm btn-outline-danger" onClick={clearRows}><i className="fas fa-eraser me-1"></i>Clear</button>
                                        </div>
                                    </div>
                                    <div className="card-body p-0">
                                        <div className="table-responsive">
                                            <table className="table table-sm table-bordered table-hover mb-0 align-middle">
                                                <thead className="table-light">
                                                    <tr>
                                                        <th style={{ width: '34px' }}>#</th>
                                                        {entryFields.map((f) => <th key={f.key} style={{ minWidth: f.width }}>{f.label}</th>)}
                                                        <th style={{ minWidth: '150px' }}>Barcode Mode</th>
                                                        <th className="text-center" style={{ width: '70px' }} title="Update the matching stock item instead of erroring on a duplicate barcode">Update</th>
                                                        <th className="text-center" style={{ width: '70px' }} title="Create a new (duplicate) product with a different name">New Prod.</th>
                                                        <th style={{ minWidth: '150px' }}>New Product Name</th>
                                                        <th style={{ width: '40px' }}></th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {rows.map((row, idx) => (
                                                        <tr key={row._key}>
                                                            <td className="text-muted text-center">{idx + 1}</td>
                                                            {entryFields.map((f) => (
                                                                <td key={f.key} className="p-0">
                                                                    <input className="form-control form-control-sm border-0 rounded-0"
                                                                        type={f.type} value={row[f.key]} placeholder={f.label}
                                                                        min={f.type === 'number' ? 0 : undefined}
                                                                        step={f.type === 'number' ? 'any' : undefined}
                                                                        onChange={(e) => updateRow(idx, f.key, e.target.value)} />
                                                                </td>
                                                            ))}
                                                            <td className="p-0">
                                                                <select className="form-select form-select-sm border-0 rounded-0"
                                                                    value={row.barcodeMode} onChange={(e) => updateRow(idx, 'barcodeMode', e.target.value)}>
                                                                    {MODE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                                                </select>
                                                            </td>
                                                            <td className="text-center">
                                                                <input type="checkbox" className="form-check-input" checked={!!row.updateExisting}
                                                                    onChange={(e) => updateRow(idx, 'updateExisting', e.target.checked)} />
                                                            </td>
                                                            <td className="text-center">
                                                                <input type="checkbox" className="form-check-input" checked={!!row.createNewProduct}
                                                                    onChange={(e) => updateRow(idx, 'createNewProduct', e.target.checked)} />
                                                            </td>
                                                            <td className="p-0">
                                                                <input className="form-control form-control-sm border-0 rounded-0"
                                                                    type="text" value={row.newProductName} placeholder={row.createNewProduct ? 'new product name' : '—'}
                                                                    disabled={!row.createNewProduct}
                                                                    onChange={(e) => updateRow(idx, 'newProductName', e.target.value)} />
                                                            </td>
                                                            <td className="text-center p-0">
                                                                <button className="btn btn-sm btn-link text-danger p-1" onClick={() => removeRow(idx)} title="Remove row">
                                                                    <i className="fas fa-times"></i>
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                    <div className="card-footer d-flex justify-content-between align-items-center">
                                        <small className="text-muted">{validCount} row(s) to import</small>
                                        <button className="btn btn-primary" onClick={handleResolve} disabled={resolving || validCount === 0}>
                                            {resolving ? <><span className="spinner-border spinner-border-sm me-1"></span>Matching…</> : <><i className="fas fa-magnifying-glass me-1"></i>Match &amp; Review</>}
                                        </button>
                                    </div>
                                </div>
                            </>
                            )}

                            {/* ═══════════ Stage 2 — Review & Match ═══════════ */}
                            {stage === 'review' && (
                                <div className="card mb-3">
                                    <div className="card-header d-flex justify-content-between align-items-center">
                                        <strong><i className="fas fa-magnifying-glass me-1"></i>Review &amp; Match Products</strong>
                                        <span className="text-muted small">{readyCount} of {review.length} row(s) ready</span>
                                    </div>
                                    <div className="card-body p-0">
                                        <div className="table-responsive">
                                            <table className="table table-sm table-bordered table-hover mb-0 align-middle">
                                                <thead className="table-light">
                                                    <tr>
                                                        <th style={{ width: '34px' }}>#</th>
                                                        <th style={{ minWidth: '170px' }}>Entered Name</th>
                                                        <th style={{ minWidth: '320px' }}>Product Match</th>
                                                        <th style={{ width: '60px' }}>Qty</th>
                                                        <th style={{ minWidth: '160px' }}>Unit Barcodes</th>
                                                        <th style={{ minWidth: '140px' }}>Plan</th>
                                                        <th className="text-center" style={{ width: '70px' }}>Update</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {review.map((rr, idx) => {
                                                        const plan = rr.plan || {};
                                                        const ready = rowReady(rr);
                                                        const willUpdate = rr.updateExisting ? (plan.existingCount || 0) : 0;
                                                        const willCreate = plan.willCreate != null ? plan.willCreate : rr.quantity;
                                                        return (
                                                            <tr key={rr._key} className={ready ? '' : 'table-warning'}>
                                                                <td className="text-muted text-center">{idx + 1}</td>
                                                                <td>
                                                                    {rr.productName || <span className="text-muted">—</span>}
                                                                    {rr.stockItemName && <div><small className="text-muted">item: {rr.stockItemName}</small></div>}
                                                                </td>
                                                                <td>
                                                                    {rr.createNew ? (
                                                                        <div className="d-flex align-items-center gap-2">
                                                                            <span className="badge bg-primary"><i className="fas fa-plus me-1"></i>New</span>
                                                                            <input className="form-control form-control-sm" style={{ maxWidth: '220px' }}
                                                                                value={rr.newName} placeholder="new product name"
                                                                                onChange={(e) => updateReviewRow(idx, { newName: e.target.value })} />
                                                                            <button className="btn btn-sm btn-link p-0" onClick={() => updateReviewRow(idx, { createNew: false })}>match instead</button>
                                                                        </div>
                                                                    ) : (
                                                                        <div className="d-flex align-items-center gap-2 flex-wrap">
                                                                            {rr.decisionDocId ? (
                                                                                <span className="badge bg-success text-truncate" style={{ maxWidth: '220px' }} title={rr.productLabel}>
                                                                                    <i className="fas fa-check me-1"></i>{rr.productLabel || rr.decisionDocId}
                                                                                </span>
                                                                            ) : plan.matchType === 'name-multiple' ? (
                                                                                <select className="form-select form-select-sm" style={{ maxWidth: '240px' }}
                                                                                    value={rr.decisionDocId}
                                                                                    onChange={(e) => {
                                                                                        const c = (plan.candidates || []).find((x) => x.documentId === e.target.value);
                                                                                        updateReviewRow(idx, { decisionDocId: e.target.value, productLabel: c?.name || '' });
                                                                                    }}>
                                                                                    <option value="">— choose match —</option>
                                                                                    {(plan.candidates || []).map((c) => <option key={c.documentId} value={c.documentId}>{c.name}</option>)}
                                                                                </select>
                                                                            ) : (
                                                                                <span className="badge bg-danger"><i className="fas fa-triangle-exclamation me-1"></i>No match</span>
                                                                            )}
                                                                            <button className="btn btn-sm btn-outline-secondary" onClick={() => setPickerRow(idx)}>
                                                                                <i className="fas fa-search me-1"></i>Pick
                                                                            </button>
                                                                            <button className="btn btn-sm btn-outline-primary"
                                                                                onClick={() => updateReviewRow(idx, { createNew: true, newName: rr.newName || rr.productName || '', decisionDocId: '' })}>
                                                                                <i className="fas fa-plus me-1"></i>New
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </td>
                                                                <td className="text-center">{rr.barcodeMode === 'product' ? '—' : rr.quantity}</td>
                                                                <td>
                                                                    {rr.barcodeMode === 'product' ? (
                                                                        <small className="text-muted">→ on product:<br /><code>{rr.barcode || '—'}</code></small>
                                                                    ) : (
                                                                        <small className="text-muted">
                                                                            {rr.barcodeMode === 'auto'
                                                                                ? <em>auto-generated</em>
                                                                                : (plan.previewBarcodes && plan.previewBarcodes.length
                                                                                    ? plan.previewBarcodes.slice(0, 3).join(', ') + (plan.previewBarcodes.length > 3 ? ` …(+${plan.previewBarcodes.length - 3})` : '')
                                                                                    : <em>auto-generated</em>)}
                                                                        </small>
                                                                    )}
                                                                    <div><small className="text-muted">{MODE_LABEL[rr.barcodeMode] || rr.barcodeMode}</small></div>
                                                                </td>
                                                                <td>
                                                                    {rr.barcodeMode === 'product' ? (
                                                                        <small>
                                                                            <span className="text-primary">set product barcode</span>
                                                                            {plan.currentInStock != null && <span className="text-muted d-block">{plan.currentInStock} in stock (untouched)</span>}
                                                                        </small>
                                                                    ) : (
                                                                        <small>
                                                                            <span className="text-success">+{willCreate} new</span>
                                                                            {(plan.existingCount || 0) > 0 && (
                                                                                rr.updateExisting
                                                                                    ? <span className="text-primary d-block">↻ {willUpdate} update</span>
                                                                                    : <span className="text-danger d-block">⚠ {plan.existingCount} exist</span>
                                                                            )}
                                                                        </small>
                                                                    )}
                                                                </td>
                                                                <td className="text-center">
                                                                    <input type="checkbox" className="form-check-input" checked={!!rr.updateExisting}
                                                                        onChange={(e) => updateReviewRow(idx, { updateExisting: e.target.checked })} />
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                    <div className="card-footer d-flex justify-content-between align-items-center">
                                        <button className="btn btn-outline-secondary" onClick={() => setStage('entry')}>
                                            <i className="fas fa-arrow-left me-1"></i>Back to Edit
                                        </button>
                                        <div className="d-flex align-items-center gap-2">
                                            <small className="text-muted">{readyCount} ready{review.length - readyCount > 0 ? `, ${review.length - readyCount} unresolved` : ''}</small>
                                            <button className="btn btn-success" onClick={handleProcess} disabled={processing || readyCount === 0}>
                                                {processing ? <><span className="spinner-border spinner-border-sm me-1"></span>Processing…</> : <><i className="fas fa-cogs me-1"></i>Process Import</>}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ═══════════ Stage 3 — Result ═══════════ */}
                            {stage === 'done' && results && (
                                <div className="card mb-3">
                                    <div className="card-header d-flex justify-content-between align-items-center">
                                        <strong><i className="fas fa-check-circle me-1"></i>Import Result</strong>
                                        <div className="d-flex gap-2">
                                            {createdIds.length > 0 && (
                                                <button className="btn btn-sm btn-outline-primary" onClick={handlePrintLabels}>
                                                    <i className="fas fa-print me-1"></i>Print Labels ({createdIds.length})
                                                </button>
                                            )}
                                            <button className="btn btn-sm btn-primary" onClick={resetAll}>
                                                <i className="fas fa-plus me-1"></i>New Import
                                            </button>
                                        </div>
                                    </div>
                                    <div className="card-body">
                                        <div className="d-flex gap-3 mb-3 flex-wrap">
                                            <span className="badge bg-secondary fs-6">Processed {results.processed}</span>
                                            <span className="badge bg-success fs-6">OK {results.ok}</span>
                                            <span className="badge bg-danger fs-6">Failed {results.failed}</span>
                                            <span className="badge bg-primary fs-6">Stock items created {createdIds.length}</span>
                                        </div>
                                        <div className="table-responsive">
                                            <table className="table table-sm table-bordered mb-0">
                                                <thead className="table-light">
                                                    <tr><th>#</th><th>Status</th><th>Created</th><th>Updated</th><th>Detail</th></tr>
                                                </thead>
                                                <tbody>
                                                    {(results.results || []).map((r) => (
                                                        <tr key={r.index} className={r.ok ? '' : 'table-danger'}>
                                                            <td>{r.index + 1}</td>
                                                            <td>{r.ok ? <span className="text-success"><i className="fas fa-check"></i></span> : <span className="text-danger"><i className="fas fa-times"></i></span>}</td>
                                                            <td>{r.created ?? '-'}</td>
                                                            <td>{r.updated ?? '-'}</td>
                                                            <td><small>{r.ok ? (r.productDocumentId || '') : (r.error || '')}</small></td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </ListPageLayout>

                    <ProductPickerModal
                        show={pickerRow != null}
                        onClose={() => setPickerRow(null)}
                        onSelect={onPickProduct}
                        title="Select product to link"
                    />
                </Layout>
            </PermissionCheck>
        </ProtectedRoute>
    );
}
