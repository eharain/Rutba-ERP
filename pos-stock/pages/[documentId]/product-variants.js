import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../../components/Layout';
import ProtectedRoute from '@rutba/pos-shared/components/ProtectedRoute';
import { authApi, relationConnects } from '@rutba/pos-shared/lib/api';
import { saveProduct } from '@rutba/pos-shared/lib/pos/save';

function getEntryId(entry) {
    return entry?.documentId || entry?.id;
}

export default function ProductVariantsPage() {
    const router = useRouter();
    const { documentId } = router.query;

    const [selectedProduct, setSelectedProduct] = useState(null);
    const [variants, setVariants] = useState([]);
    const [variantStockCounts, setVariantStockCounts] = useState({});
    const [stockItems, setStockItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedItems, setSelectedItems] = useState(new Set());
    const [termTypes, setTermTypes] = useState([]);
    const [selectedTermTypeId, setSelectedTermTypeId] = useState('');
    const [termForms, setTermForms] = useState({});
    const [nameAffix, setNameAffix] = useState('suffix');
    const [variantBaseName, setVariantBaseName] = useState('');
    const [bulkCreating, setBulkCreating] = useState(false);
    const [moveTargetVariantId, setMoveTargetVariantId] = useState('');
    const [selectedVariants, setSelectedVariants] = useState(new Set());
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        if (documentId) {
            loadProductDetails(documentId);
        }
    }, [documentId]);

    useEffect(() => {
        loadTermTypes();
    }, []);

    useEffect(() => {
        if (success || error) {
            const timer = setTimeout(() => { setSuccess(''); setError(''); }, 5000);
            return () => clearTimeout(timer);
        }
    }, [success, error]);

    async function loadProductDetails(id) {
        setLoading(true);
        try {
            const res = await authApi.get(`/products/${id}`, { populate: { variants: { populate: ['terms'] }, items: true, terms: true } });
            const prod = res.data || res;
            setSelectedProduct(prod);
            const loadedVariants = prod.variants || [];
            setVariants(loadedVariants);
            setVariantBaseName(prod?.name || '');

            const itemsRes = await authApi.fetch('/stock-items', {
                filters: { product: { documentId: id } },
                pagination: { page: 1, pageSize: 500 },
                sort: ['createdAt:desc']
            });
            const items = itemsRes?.data ?? itemsRes;
            setStockItems(items || []);
            setSelectedItems(new Set());

            const counts = {};
            for (const v of loadedVariants) {
                const vId = getEntryId(v);
                try {
                    const countRes = await authApi.fetch('/stock-items', {
                        filters: { product: { documentId: vId } },
                        pagination: { page: 1, pageSize: 1 },
                    });
                    counts[vId] = countRes?.meta?.pagination?.total ?? 0;
                } catch { counts[vId] = 0; }
            }
            setVariantStockCounts(counts);
        } catch (err) {
            console.error('Failed to load product details', err);
            setError('Failed to load product details');
        } finally {
            setLoading(false);
        }
    }

    async function loadTermTypes() {
        try {
            const res = await authApi.fetch('/term-types', {
                filters: { is_variant: true },
                populate: { terms: true },
                pagination: { page: 1, pageSize: 500 },
                sort: ['name:asc']
            });
            const types = res?.data ?? res;
            setTermTypes(types || []);
        } catch (err) {
            console.error('Failed to load term types', err);
        }
    }

    function buildVariantName(termName) {
        const baseName = variantBaseName || selectedProduct?.name || '';
        if (!termName) return baseName;
        if (!baseName) return termName;
        return nameAffix === 'prefix'
            ? `${termName} - ${baseName}`
            : `${baseName} - ${termName}`;
    }

    function getDefaultVariantForm() {
        return {
            sku: selectedProduct?.sku || '',
            barcode: selectedProduct?.barcode || '',
            selling_price: selectedProduct?.selling_price ?? 0,
            offer_price: selectedProduct?.offer_price ?? 0,
            is_active: selectedProduct?.is_active ?? true,
            move_count: 0
        };
    }

    function getTermForm(termId) {
        return termForms[termId] || getDefaultVariantForm();
    }

    function updateTermForm(termId, field, value) {
        setTermForms(prev => ({
            ...prev,
            [termId]: {
                ...getTermForm(termId),
                [field]: value
            }
        }));
    }

    function isTermAlreadyVariant(term) {
        return variants.some(v => (v.terms || []).some(t => getEntryId(t) === getEntryId(term)));
    }

    function getCreatableTerms() {
        const selectedTermType = termTypes.find(t => getEntryId(t) === selectedTermTypeId);
        if (!selectedTermType) return [];
        return (selectedTermType.terms || []).filter(term => !isTermAlreadyVariant(term));
    }

    async function handleCreateVariant(term) {
        if (!selectedProduct) return setError('Missing product');
        const selectedTermType = termTypes.find(t => getEntryId(t) === selectedTermTypeId);
        if (!selectedTermType) return setError('Choose a term type');
        if (!term) return setError('Choose a term');
        if (isTermAlreadyVariant(term)) return setError('Variant already exists for this term');
        const formValues = getTermForm(getEntryId(term));
        try {
            setLoading(true);
            const parentDocumentId = getEntryId(selectedProduct);
            const name = buildVariantName(term.name);
            const payload = {
                sku: formValues.sku,
                barcode: formValues.barcode,
                selling_price: formValues.selling_price,
                offer_price: formValues.offer_price,
                is_active: formValues.is_active,
                name,
                parent: parentDocumentId,
                is_variant: true,
                ...relationConnects({ terms: [term] })
            };
            const response = await saveProduct('new', payload);
            const createdVariant = response?.data?.data ?? response?.data ?? response;
            const createdVariantId = getEntryId(createdVariant);
            const createdVariantName = createdVariant?.name || name;
            if (formValues.move_count > 0 && createdVariantId) {
                const itemsToMove = stockItems.slice(0, Math.min(formValues.move_count, stockItems.length));
                for (const item of itemsToMove) {
                    await authApi.put(`/stock-items/${getEntryId(item)}`, { data: { product: { set: [createdVariantId] }, name: createdVariantName } });
                }
            }
            await loadProductDetails(parentDocumentId);
            setTermForms(prev => ({ ...prev, [getEntryId(term)]: getDefaultVariantForm() }));
            setSuccess(`Variant "${createdVariantName}" created`);
        } catch (err) {
            console.error('Failed to create variant', err);
            setError('Failed to create variant');
        } finally {
            setLoading(false);
        }
    }

    async function handleBulkCreateVariants() {
        const creatableTerms = getCreatableTerms();
        if (creatableTerms.length === 0) return setError('No new variants to create');
        if (!confirm(`Create ${creatableTerms.length} variant(s)?`)) return;
        setBulkCreating(true);
        setLoading(true);
        let created = 0;
        try {
            const parentDocumentId = getEntryId(selectedProduct);
            for (const term of creatableTerms) {
                const termId = getEntryId(term);
                const formValues = getTermForm(termId);
                const name = buildVariantName(term.name);
                const payload = {
                    sku: formValues.sku,
                    barcode: formValues.barcode,
                    selling_price: formValues.selling_price,
                    offer_price: formValues.offer_price,
                    is_active: formValues.is_active,
                    name,
                    parent: parentDocumentId,
                    is_variant: true,
                    ...relationConnects({ terms: [term] })
                };
                const response = await saveProduct('new', payload);
                const createdVariant = response?.data?.data ?? response?.data ?? response;
                const createdVariantId = getEntryId(createdVariant);
                const createdVariantName = createdVariant?.name || name;
                if (formValues.move_count > 0 && createdVariantId) {
                    const currentItems = await authApi.fetch('/stock-items', {
                        filters: { product: { documentId: parentDocumentId } },
                        pagination: { page: 1, pageSize: formValues.move_count },
                        sort: ['createdAt:desc']
                    });
                    const items = currentItems?.data ?? currentItems ?? [];
                    for (const item of items) {
                        await authApi.put(`/stock-items/${getEntryId(item)}`, { data: { product: { set: [createdVariantId] }, name: createdVariantName } });
                    }
                }
                created++;
            }
            await loadProductDetails(parentDocumentId);
            setTermForms({});
            setSuccess(`Created ${created} variant(s)`);
        } catch (err) {
            console.error('Bulk create failed', err);
            setError(`Bulk create failed after ${created} variant(s)`);
        } finally {
            setLoading(false);
            setBulkCreating(false);
        }
    }

    async function handleDeleteVariant(variant) {
        const vId = getEntryId(variant);
        const count = variantStockCounts[vId] || 0;
        if (!confirm(`Delete variant "${variant.name}"?${count > 0 ? `\n\n${count} stock item(s) will be moved back to the parent product.` : ''}`)) return;
        setLoading(true);
        try {
            const parentDocumentId = getEntryId(selectedProduct);
            if (count > 0) {
                let page = 1;
                let totalPages = 1;
                do {
                    const res = await authApi.fetch('/stock-items', {
                        filters: { product: { documentId: vId } },
                        pagination: { page, pageSize: 100 },
                    });
                    const items = res?.data ?? res ?? [];
                    totalPages = res?.meta?.pagination?.pageCount || 1;
                    for (const item of items) {
                        await authApi.put(`/stock-items/${getEntryId(item)}`, {
                            data: { product: { connect: [parentDocumentId], disconnect: [vId] }, name: selectedProduct.name }
                        });
                    }
                    page++;
                } while (page <= totalPages);
            }
            await authApi.del(`/products/${vId}`);
            await loadProductDetails(parentDocumentId);
            setSuccess(`Variant "${variant.name}" deleted${count > 0 ? `, ${count} item(s) moved to parent` : ''}`);
        } catch (err) {
            console.error('Failed to delete variant', err);
            setError('Failed to delete variant');
        } finally {
            setLoading(false);
        }
    }

    async function handleBulkDeleteVariants() {
        if (selectedVariants.size === 0) return setError('Select variants to delete');
        const toDelete = variants.filter(v => selectedVariants.has(getEntryId(v)));
        const totalStock = toDelete.reduce((sum, v) => sum + (variantStockCounts[getEntryId(v)] || 0), 0);
        if (!confirm(`Delete ${toDelete.length} variant(s)?${totalStock > 0 ? `\n\n${totalStock} stock item(s) will be moved back to the parent product.` : ''}`)) return;
        setLoading(true);
        try {
            const parentDocumentId = getEntryId(selectedProduct);
            for (const variant of toDelete) {
                const vId = getEntryId(variant);
                const count = variantStockCounts[vId] || 0;
                if (count > 0) {
                    let page = 1;
                    let totalPages = 1;
                    do {
                        const res = await authApi.fetch('/stock-items', {
                            filters: { product: { documentId: vId } },
                            pagination: { page, pageSize: 100 },
                        });
                        const items = res?.data ?? res ?? [];
                        totalPages = res?.meta?.pagination?.pageCount || 1;
                        for (const item of items) {
                            await authApi.put(`/stock-items/${getEntryId(item)}`, {
                                data: { product: { connect: [parentDocumentId], disconnect: [vId] }, name: selectedProduct.name }
                            });
                        }
                        page++;
                    } while (page <= totalPages);
                }
                await authApi.del(`/products/${vId}`);
            }
            setSelectedVariants(new Set());
            await loadProductDetails(parentDocumentId);
            setSuccess(`Deleted ${toDelete.length} variant(s)`);
        } catch (err) {
            console.error('Bulk delete failed', err);
            setError('Failed to delete variants');
        } finally {
            setLoading(false);
        }
    }

    function toggleSelectItem(itemId) {
        setSelectedItems(prev => {
            const s = new Set(prev);
            if (s.has(itemId)) s.delete(itemId); else s.add(itemId);
            return s;
        });
    }

    function selectAllVisible() {
        if (selectedItems.size === stockItems.length) {
            setSelectedItems(new Set());
        } else {
            setSelectedItems(new Set(stockItems.map(i => getEntryId(i))));
        }
    }

    function toggleSelectVariant(vId) {
        setSelectedVariants(prev => {
            const s = new Set(prev);
            if (s.has(vId)) s.delete(vId); else s.add(vId);
            return s;
        });
    }

    function selectAllVariants() {
        if (selectedVariants.size === variants.length) {
            setSelectedVariants(new Set());
        } else {
            setSelectedVariants(new Set(variants.map(v => getEntryId(v))));
        }
    }

    async function moveSelectedToVariant() {
        if (!moveTargetVariantId) return setError('Choose a variant to move items to');
        if (selectedItems.size === 0) return setError('Select stock items to move');
        const variant = variants.find(v => getEntryId(v) === moveTargetVariantId);
        if (!variant) return setError('Variant not found');
        if (!confirm(`Move ${selectedItems.size} stock item(s) to "${variant.name}"?`)) return;
        setLoading(true);
        try {
            const ids = Array.from(selectedItems);
            for (const id of ids) {
                await authApi.put(`/stock-items/${id}`, {
                    data: {
                        product: { set: [getEntryId(variant)] },
                        name: variant.name
                    }
                });
            }
            setSuccess(`Moved ${ids.length} item(s) to "${variant.name}"`);
            setMoveTargetVariantId('');
            await loadProductDetails(getEntryId(selectedProduct));
        } catch (err) {
            console.error('Failed to move stock items', err);
            setError('Failed to move stock items');
        } finally {
            setLoading(false);
        }
    }

    const selectedTermType = termTypes.find(t => getEntryId(t) === selectedTermTypeId);
    const currentTerms = selectedTermType?.terms || [];
    const creatableTerms = getCreatableTerms();

    return (
        <ProtectedRoute>
            <Layout>
                <div style={{ padding: 5 }}>
                    {/* Page navigation */}
                    <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
                        <Link href={`/${documentId}/product-edit`} className="btn btn-outline-secondary btn-sm">
                            <i className="fas fa-edit me-1" /> Edit
                        </Link>
                        <Link href={`/${documentId}/product-stock-items`} className="btn btn-outline-secondary btn-sm">
                            <i className="fas fa-boxes me-1" /> Stock Control
                        </Link>
                        <span className="btn btn-primary btn-sm">
                            <i className="fas fa-layer-group me-1" /> Variants
                        </span>
                        <Link href={`/${documentId}/catalogue-import`} className="btn btn-outline-secondary btn-sm">
                            <i className="fas fa-file-pdf me-1" /> Catalogue Import
                        </Link>
                        <Link href={`/stock-items?product=${documentId}`} className="btn btn-outline-secondary btn-sm">
                            <i className="fas fa-barcode me-1" /> Stock Items
                        </Link>
                        <Link href={`/${documentId}/product-relations`} className="btn btn-outline-secondary btn-sm">
                            <i className="fas fa-compress-arrows-alt me-1" /> Relations &amp; Merge
                        </Link>
                        <Link href="/products" className="btn btn-outline-dark btn-sm ms-auto">
                            <i className="fas fa-arrow-left me-1" /> Products
                        </Link>
                    </div>

                    <h5 className="mb-3">
                        <i className="fas fa-layer-group me-2" />
                        Variants for: {selectedProduct?.name}
                        {selectedProduct && <span className="badge bg-secondary ms-2">{variants.length} variant(s)</span>}
                        {selectedProduct && <span className="badge bg-info ms-2">{stockItems.length} parent stock item(s)</span>}
                    </h5>

                    {error && <div className="alert alert-danger alert-dismissible py-2">{error}<button type="button" className="btn-close" onClick={() => setError('')} /></div>}
                    {success && <div className="alert alert-success alert-dismissible py-2">{success}<button type="button" className="btn-close" onClick={() => setSuccess('')} /></div>}
                    {loading && <div className="alert alert-info py-2"><i className="fas fa-spinner fa-spin me-2" />Processing...</div>}

                    {/* Existing Variants */}
                    <div className="card mb-3">
                        <div className="card-header d-flex justify-content-between align-items-center py-2">
                            <h6 className="mb-0"><i className="fas fa-list me-2" />Existing Variants ({variants.length})</h6>
                            {variants.length > 0 && (
                                <div className="d-flex gap-2">
                                    <button className="btn btn-outline-primary btn-sm" type="button" onClick={selectAllVariants}>
                                        {selectedVariants.size === variants.length ? 'Unselect All' : 'Select All'}
                                    </button>
                                    {selectedVariants.size > 0 && (
                                        <button className="btn btn-outline-danger btn-sm" type="button" onClick={handleBulkDeleteVariants} disabled={loading}>
                                            <i className="fas fa-trash me-1" />Delete Selected ({selectedVariants.size})
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="card-body p-0">
                            {variants.length === 0 ? (
                                <div className="text-muted p-3">No variants yet. Use the section below to create variants from terms.</div>
                            ) : (
                                <div className="table-responsive">
                                    <table className="table table-sm table-hover align-middle mb-0">
                                        <thead className="table-light">
                                            <tr>
                                                <th style={{ width: '30px' }}></th>
                                                <th>Name</th>
                                                <th>Terms</th>
                                                <th>SKU</th>
                                                <th>Barcode</th>
                                                <th className="text-end">Selling</th>
                                                <th className="text-end">Offer</th>
                                                <th className="text-center">Stock</th>
                                                <th className="text-center">Status</th>
                                                <th style={{ width: '120px' }}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {variants.map(v => {
                                                const vId = getEntryId(v);
                                                const stockCount = variantStockCounts[vId] ?? '...';
                                                const termNames = (v.terms || []).map(t => t.name).join(', ');
                                                return (
                                                    <tr key={vId}>
                                                        <td>
                                                            <input
                                                                type="checkbox"
                                                                className="form-check-input"
                                                                checked={selectedVariants.has(vId)}
                                                                onChange={() => toggleSelectVariant(vId)}
                                                            />
                                                        </td>
                                                        <td><strong>{v.name}</strong></td>
                                                        <td>
                                                            {termNames ? termNames.split(', ').map((tn, i) => (
                                                                <span key={i} className="badge bg-light text-dark border me-1">{tn}</span>
                                                            )) : <span className="text-muted">—</span>}
                                                        </td>
                                                        <td><span className="small">{v.sku || '—'}</span></td>
                                                        <td><span className="small">{v.barcode || '—'}</span></td>
                                                        <td className="text-end">{v.selling_price ?? '—'}</td>
                                                        <td className="text-end">{v.offer_price ?? '—'}</td>
                                                        <td className="text-center">
                                                            <span className={`badge ${stockCount > 0 ? 'bg-success' : 'bg-secondary'}`}>{stockCount}</span>
                                                        </td>
                                                        <td className="text-center">
                                                            {v.is_active !== false
                                                                ? <span className="badge bg-success">Active</span>
                                                                : <span className="badge bg-warning text-dark">Inactive</span>}
                                                        </td>
                                                        <td>
                                                            <div className="btn-group btn-group-sm">
                                                                <Link href={`/${vId}/product-edit`} className="btn btn-outline-primary" title="Edit variant">
                                                                    <i className="fas fa-edit" />
                                                                </Link>
                                                                <Link href={`/stock-items?product=${vId}`} className="btn btn-outline-info" title="View stock items">
                                                                    <i className="fas fa-barcode" />
                                                                </Link>
                                                                <button className="btn btn-outline-danger" type="button" title="Delete variant" onClick={() => handleDeleteVariant(v)} disabled={loading}>
                                                                    <i className="fas fa-trash" />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Create Variants */}
                    <div className="card mb-3">
                        <div className="card-header d-flex justify-content-between align-items-center py-2">
                            <h6 className="mb-0"><i className="fas fa-plus-circle me-2" />Create Variants</h6>
                            {selectedTermTypeId && creatableTerms.length > 0 && (
                                <button
                                    className="btn btn-success btn-sm"
                                    type="button"
                                    onClick={handleBulkCreateVariants}
                                    disabled={loading || bulkCreating}
                                >
                                    <i className="fas fa-bolt me-1" />
                                    {bulkCreating ? 'Creating...' : `Create All (${creatableTerms.length})`}
                                </button>
                            )}
                        </div>
                        <div className="card-body">
                            <div className="row g-2 mb-3">
                                <div className="col-md-4">
                                    <label className="form-label small fw-bold mb-1">Term Type</label>
                                    <select
                                        className="form-select form-select-sm"
                                        value={selectedTermTypeId}
                                        onChange={(e) => setSelectedTermTypeId(e.target.value)}
                                    >
                                        <option value="">Choose term type...</option>
                                        {termTypes.map(tt => (
                                            <option key={getEntryId(tt)} value={getEntryId(tt)}>{tt.name} ({(tt.terms || []).length} terms)</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="col-md-4">
                                    <label className="form-label small fw-bold mb-1">Base Name</label>
                                    <input
                                        className="form-control form-control-sm"
                                        value={variantBaseName}
                                        onChange={(e) => setVariantBaseName(e.target.value)}
                                        placeholder="Parent name"
                                    />
                                </div>
                                <div className="col-md-4">
                                    <label className="form-label small fw-bold mb-1">Naming</label>
                                    <select
                                        className="form-select form-select-sm"
                                        value={nameAffix}
                                        onChange={(e) => setNameAffix(e.target.value)}
                                    >
                                        <option value="suffix">Base Name - Term</option>
                                        <option value="prefix">Term - Base Name</option>
                                    </select>
                                </div>
                            </div>

                            {selectedTermTypeId && (
                                <div className="table-responsive">
                                    <table className="table table-sm align-middle table-bordered">
                                        <thead className="table-light">
                                            <tr>
                                                <th>Term</th>
                                                <th>Variant Name</th>
                                                <th>SKU</th>
                                                <th>Barcode</th>
                                                <th>Selling</th>
                                                <th>Offer</th>
                                                <th style={{ width: '80px' }}>Move Qty</th>
                                                <th style={{ width: '50px' }}>Active</th>
                                                <th style={{ width: '80px' }}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {currentTerms.map(term => {
                                                const termId = getEntryId(term);
                                                const alreadyExists = isTermAlreadyVariant(term);
                                                const formValues = getTermForm(termId);
                                                return (
                                                    <tr key={termId} className={alreadyExists ? 'table-light' : ''}>
                                                        <td>
                                                            {term.name}
                                                            {alreadyExists && <span className="badge bg-success ms-2">Created</span>}
                                                        </td>
                                                        <td>
                                                            <input
                                                                value={buildVariantName(term.name)}
                                                                className="form-control form-control-sm bg-light"
                                                                readOnly
                                                                tabIndex={-1}
                                                            />
                                                        </td>
                                                        <td>
                                                            <input
                                                                value={formValues.sku}
                                                                onChange={(e) => updateTermForm(termId, 'sku', e.target.value)}
                                                                className="form-control form-control-sm"
                                                                placeholder="SKU"
                                                                disabled={alreadyExists}
                                                            />
                                                        </td>
                                                        <td>
                                                            <input
                                                                value={formValues.barcode}
                                                                onChange={(e) => updateTermForm(termId, 'barcode', e.target.value)}
                                                                className="form-control form-control-sm"
                                                                placeholder="Barcode"
                                                                disabled={alreadyExists}
                                                            />
                                                        </td>
                                                        <td>
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                value={formValues.selling_price}
                                                                onChange={(e) => updateTermForm(termId, 'selling_price', e.target.value)}
                                                                className="form-control form-control-sm"
                                                                disabled={alreadyExists}
                                                            />
                                                        </td>
                                                        <td>
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                value={formValues.offer_price}
                                                                onChange={(e) => updateTermForm(termId, 'offer_price', e.target.value)}
                                                                className="form-control form-control-sm"
                                                                disabled={alreadyExists}
                                                            />
                                                        </td>
                                                        <td>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                max={stockItems.length}
                                                                value={formValues.move_count}
                                                                onChange={(e) => updateTermForm(termId, 'move_count', Number(e.target.value))}
                                                                className="form-control form-control-sm"
                                                                disabled={alreadyExists}
                                                            />
                                                        </td>
                                                        <td className="text-center">
                                                            <input
                                                                type="checkbox"
                                                                className="form-check-input"
                                                                checked={formValues.is_active}
                                                                onChange={(e) => updateTermForm(termId, 'is_active', e.target.checked)}
                                                                disabled={alreadyExists}
                                                            />
                                                        </td>
                                                        <td>
                                                            <button
                                                                className="btn btn-sm btn-primary w-100"
                                                                type="button"
                                                                onClick={() => handleCreateVariant(term)}
                                                                disabled={alreadyExists || loading}
                                                            >
                                                                {alreadyExists ? <i className="fas fa-check" /> : 'Create'}
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            {currentTerms.length === 0 && (
                                                <tr>
                                                    <td colSpan="9" className="text-muted text-center py-3">No terms for this term type</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {!selectedTermTypeId && (
                                <div className="text-muted text-center py-3">
                                    <i className="fas fa-info-circle me-2" />Choose a term type above to see available terms for creating variants
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Parent Stock Items - Move to Variant */}
                    <div className="card mb-3">
                        <div className="card-header d-flex justify-content-between align-items-center py-2">
                            <h6 className="mb-0">
                                <i className="fas fa-boxes me-2" />Parent Stock Items ({stockItems.length})
                            </h6>
                            <div className="d-flex align-items-center gap-2">
                                {stockItems.length > 0 && (
                                    <button className="btn btn-sm btn-outline-primary" onClick={selectAllVisible} type="button">
                                        {selectedItems.size === stockItems.length && stockItems.length > 0 ? 'Unselect All' : 'Select All'}
                                    </button>
                                )}
                                {selectedItems.size > 0 && <span className="badge bg-primary">{selectedItems.size} selected</span>}
                            </div>
                        </div>
                        <div className="card-body">
                            {variants.length > 0 && stockItems.length > 0 && (
                                <div className="d-flex align-items-center gap-2 mb-3 p-2 bg-light rounded">
                                    <label className="form-label mb-0 small fw-bold text-nowrap">Move to:</label>
                                    <select
                                        className="form-select form-select-sm"
                                        style={{ maxWidth: '280px' }}
                                        value={moveTargetVariantId}
                                        onChange={(e) => setMoveTargetVariantId(e.target.value)}
                                    >
                                        <option value="">Choose variant...</option>
                                        {variants.map(v => {
                                            const vId = getEntryId(v);
                                            return <option key={vId} value={vId}>{v.name} ({variantStockCounts[vId] ?? 0} items)</option>;
                                        })}
                                    </select>
                                    <button
                                        className="btn btn-sm btn-success text-nowrap"
                                        onClick={moveSelectedToVariant}
                                        disabled={loading || selectedItems.size === 0 || !moveTargetVariantId}
                                        type="button"
                                    >
                                        <i className="fas fa-arrow-right me-1" />Move {selectedItems.size > 0 ? `(${selectedItems.size})` : ''}
                                    </button>
                                </div>
                            )}

                            {stockItems.length === 0 ? (
                                <div className="text-muted text-center py-3">No stock items on the parent product</div>
                            ) : (
                                <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
                                    <table className="table table-sm table-hover align-middle mb-0">
                                        <thead className="table-light" style={{ position: 'sticky', top: 0 }}>
                                            <tr>
                                                <th style={{ width: '30px' }}>
                                                    <input
                                                        type="checkbox"
                                                        className="form-check-input"
                                                        checked={selectedItems.size === stockItems.length && stockItems.length > 0}
                                                        onChange={selectAllVisible}
                                                    />
                                                </th>
                                                <th>Name / SKU</th>
                                                <th>Barcode</th>
                                                <th>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {stockItems.map(item => {
                                                const id = getEntryId(item);
                                                return (
                                                    <tr key={id} className={selectedItems.has(id) ? 'table-primary' : ''} onClick={() => toggleSelectItem(id)} style={{ cursor: 'pointer' }}>
                                                        <td onClick={(e) => e.stopPropagation()}>
                                                            <input
                                                                type="checkbox"
                                                                className="form-check-input"
                                                                checked={selectedItems.has(id)}
                                                                onChange={() => toggleSelectItem(id)}
                                                            />
                                                        </td>
                                                        <td><strong>{item.sku || item.name || 'Stock'}</strong></td>
                                                        <td><span className="small">{item.barcode || '—'}</span></td>
                                                        <td><span className={`badge ${item.status === 'available' ? 'bg-success' : 'bg-secondary'}`}>{item.status || 'unknown'}</span></td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() { return { props: {} }; }
