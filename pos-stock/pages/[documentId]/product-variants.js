import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../../components/Layout';
import ProtectedRoute from '@rutba/pos-shared/components/ProtectedRoute';
import { TermTypesEndpoints, StockItemsEndpoints, ProductsEndpoints, MediaUtilsEndpoints, fetchProducts } from '@rutba/api-provider/endpoints';
import ProductVariantManager from '@rutba/pos-shared/components/ProductVariantManager';
import TermTypeTermDialog from '@rutba/pos-shared/components/TermTypeTermDialog';
import ProductPageShell, { buildStockProductTabs } from '@rutba/pos-shared/components/product/ProductPageShell';
import { createVariant } from '@rutba/pos-shared/lib/variants';

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
    const [rowEdits, setRowEdits] = useState({});
    const [rowSaving, setRowSaving] = useState({});
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [showTermTypeDialog, setShowTermTypeDialog] = useState(false);

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
            // byIdDraft + explicit variants populate: byId() defaults to
            // status=published and its default populate omits `variants`, so the
            // tab was silently showing zero variants even when the CMS (which uses
            // byIdDraft with explicit populate) showed many. Match the CMS.
            const res = await ProductsEndpoints.byIdDraft(id, {
                populate: {
                    categories: true,
                    brands: true,
                    suppliers: true,
                    logo: true,
                    gallery: true,
                    terms: true,
                    parent: true,
                    variants: { populate: { logo: true, gallery: true, terms: true } },
                },
            });
            const prod = res.data || res;
            setSelectedProduct(prod);
            const loadedVariants = prod.variants || [];
            setVariants(loadedVariants);
            setVariantBaseName(prod?.name || '');

            const itemsRes = await StockItemsEndpoints.byProduct(id, { pageSize: 500, sort: ['createdAt:desc'] });
            const items = itemsRes?.data ?? itemsRes;
            setStockItems(items || []);
            setSelectedItems(new Set());

            const counts = {};
            for (const v of loadedVariants) {
                const vId = getEntryId(v);
                try {
                    const countRes = await StockItemsEndpoints.byProduct(vId, { pageSize: 1 });
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
            const res = await TermTypesEndpoints.listVariants();
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
            const moveStockItemDocIds = formValues.move_count > 0
                ? stockItems.slice(0, Math.min(formValues.move_count, stockItems.length)).map(getEntryId)
                : [];
            const created = await createVariant(parentDocumentId, 'term', {
                term,
                baseName: variantBaseName || selectedProduct?.name || '',
                namingMode: nameAffix,
                sku: formValues.sku,
                barcode: formValues.barcode,
                selling_price: formValues.selling_price,
                offer_price: formValues.offer_price,
                is_active: formValues.is_active,
                moveStockItemDocIds,
            });
            await loadProductDetails(parentDocumentId);
            setTermForms(prev => ({ ...prev, [getEntryId(term)]: getDefaultVariantForm() }));
            setSuccess(`Variant "${created.name || buildVariantName(term.name)}" created`);
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
                const formValues = getTermForm(getEntryId(term));
                // Bulk path fetches a fresh tail of parent stock items per variant
                // (parent stock-item count changes after each create).
                let moveStockItemDocIds = [];
                if (formValues.move_count > 0) {
                    const currentItems = await StockItemsEndpoints.byProduct(parentDocumentId, { pageSize: formValues.move_count, sort: ['createdAt:desc'] });
                    const items = currentItems?.data ?? currentItems ?? [];
                    moveStockItemDocIds = items.map(getEntryId);
                }
                await createVariant(parentDocumentId, 'term', {
                    term,
                    baseName: variantBaseName || selectedProduct?.name || '',
                    namingMode: nameAffix,
                    sku: formValues.sku,
                    barcode: formValues.barcode,
                    selling_price: formValues.selling_price,
                    offer_price: formValues.offer_price,
                    is_active: formValues.is_active,
                    moveStockItemDocIds,
                });
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
                    const res = await StockItemsEndpoints.byProduct(vId, { page, pageSize: 100 });
                    const items = res?.data ?? res ?? [];
                    totalPages = res?.meta?.pagination?.pageCount || 1;
                    for (const item of items) {
                        await StockItemsEndpoints.update(getEntryId(item), {
                            product: { connect: [parentDocumentId], disconnect: [vId] }, name: selectedProduct.name
                        });
                    }
                    page++;
                } while (page <= totalPages);
            }
            await ProductsEndpoints.del(vId);
            await loadProductDetails(parentDocumentId);
            setSuccess(`Variant "${variant.name}" deleted${count > 0 ? `, ${count} item(s) moved to parent` : ''}`);
        } catch (err) {
            console.error('Failed to delete variant', err);
            setError('Failed to delete variant');
        } finally {
            setLoading(false);
        }
    }

    async function copyParentImagesToVariant(v) {
        const vId = getEntryId(v);
        const variantGallery = v.gallery || [];
        const parentGalleryItems = selectedProduct?.gallery || [];
        if (parentGalleryItems.length === 0) return setError('Parent has no images to copy');
        const existing = new Set(variantGallery.map(g => g.id));
        const newIds = parentGalleryItems.map(g => g.id).filter(id => !existing.has(id));
        if (newIds.length === 0) return setError(`"${v.name}" already has all parent images`);
        if (!confirm(`Copy ${newIds.length} image(s) from parent to "${v.name}"?`)) return;
        setLoading(true);
        try {
            await ProductsEndpoints.update(vId, {
                gallery: [...variantGallery.map(g => g.id), ...newIds],
            });
            await loadProductDetails(getEntryId(selectedProduct));
            setSuccess(`Copied ${newIds.length} image(s) from parent to "${v.name}"`);
        } catch (err) {
            console.error('Copy from parent failed', err);
            setError('Failed to copy images from parent');
        } finally {
            setLoading(false);
        }
    }

    async function copyVariantImagesToParent(v) {
        const variantGallery = v.gallery || [];
        const parentGalleryItems = selectedProduct?.gallery || [];
        if (variantGallery.length === 0) return setError(`"${v.name}" has no images to copy`);
        const existing = new Set(parentGalleryItems.map(g => g.id));
        const newIds = variantGallery.map(g => g.id).filter(id => !existing.has(id));
        if (newIds.length === 0) return setError("Parent already has all of this variant's images");
        if (!confirm(`Copy ${newIds.length} image(s) from "${v.name}" up to the parent?`)) return;
        setLoading(true);
        try {
            await ProductsEndpoints.update(getEntryId(selectedProduct), {
                gallery: [...parentGalleryItems.map(g => g.id), ...newIds],
            });
            await loadProductDetails(getEntryId(selectedProduct));
            setSuccess(`Copied ${newIds.length} image(s) from "${v.name}" to parent`);
        } catch (err) {
            console.error('Copy to parent failed', err);
            setError('Failed to copy images to parent');
        } finally {
            setLoading(false);
        }
    }

    async function handleMergeVariantToParent(variant) {
        const vId = getEntryId(variant);
        const count = variantStockCounts[vId] || 0;
        const msg = count > 0
            ? `Merge "${variant.name}" into the parent?\n\n${count} stock item(s) will be moved to the parent product and this variant will be removed.`
            : `Merge "${variant.name}" into the parent?\n\nThis variant has no stock items and will simply be removed.`;
        if (!confirm(msg)) return;
        setLoading(true);
        try {
            const parentDocumentId = getEntryId(selectedProduct);
            if (count > 0) {
                let page = 1;
                let totalPages = 1;
                do {
                    const res = await StockItemsEndpoints.byProduct(vId, { page, pageSize: 100 });
                    const items = res?.data ?? res ?? [];
                    totalPages = res?.meta?.pagination?.pageCount || 1;
                    for (const item of items) {
                        await StockItemsEndpoints.update(getEntryId(item), {
                            product: { connect: [parentDocumentId], disconnect: [vId] }, name: selectedProduct.name
                        });
                    }
                    page++;
                } while (page <= totalPages);
            }
            await ProductsEndpoints.del(vId);
            await loadProductDetails(parentDocumentId);
            setSuccess(`Merged "${variant.name}" into parent${count > 0 ? ` (${count} item(s) moved)` : ''}`);
        } catch (err) {
            console.error('Failed to merge variant into parent', err);
            setError('Failed to merge variant into parent');
        } finally {
            setLoading(false);
        }
    }

    async function handleBulkMergeVariantsToParent() {
        if (selectedVariants.size === 0) return setError('Select variants to merge');
        const toMerge = variants.filter(v => selectedVariants.has(getEntryId(v)));
        const totalStock = toMerge.reduce((sum, v) => sum + (variantStockCounts[getEntryId(v)] || 0), 0);
        if (!confirm(`Merge ${toMerge.length} variant(s) into the parent?\n\n${totalStock} stock item(s) will be moved to the parent and the selected variants will be removed.`)) return;
        setLoading(true);
        try {
            const parentDocumentId = getEntryId(selectedProduct);
            for (const variant of toMerge) {
                const vId = getEntryId(variant);
                const count = variantStockCounts[vId] || 0;
                if (count > 0) {
                    let page = 1;
                    let totalPages = 1;
                    do {
                        const res = await StockItemsEndpoints.byProduct(vId, { page, pageSize: 100 });
                        const items = res?.data ?? res ?? [];
                        totalPages = res?.meta?.pagination?.pageCount || 1;
                        for (const item of items) {
                            await StockItemsEndpoints.update(getEntryId(item), {
                                product: { connect: [parentDocumentId], disconnect: [vId] }, name: selectedProduct.name
                            });
                        }
                        page++;
                    } while (page <= totalPages);
                }
                await ProductsEndpoints.del(vId);
            }
            setSelectedVariants(new Set());
            await loadProductDetails(parentDocumentId);
            setSuccess(`Merged ${toMerge.length} variant(s) into parent${totalStock > 0 ? ` (${totalStock} item(s) moved)` : ''}`);
        } catch (err) {
            console.error('Bulk merge failed', err);
            setError('Failed to merge variants into parent');
        } finally {
            setLoading(false);
        }
    }

    // --- Per-row inline editing ---
    function getRowValue(v, field) {
        const vId = getEntryId(v);
        const edit = rowEdits[vId];
        if (edit && Object.prototype.hasOwnProperty.call(edit, field)) return edit[field];
        const raw = v[field];
        return raw == null ? '' : raw;
    }

    function setRowValue(vId, field, value) {
        setRowEdits(prev => ({
            ...prev,
            [vId]: { ...prev[vId], [field]: value },
        }));
    }

    function isRowDirty(v) {
        const vId = getEntryId(v);
        const edit = rowEdits[vId];
        if (!edit) return false;
        for (const k of Object.keys(edit)) {
            const original = v[k] == null ? '' : v[k];
            if (edit[k] !== original) return true;
        }
        return false;
    }

    function cancelRowEdit(vId) {
        setRowEdits(prev => { const n = { ...prev }; delete n[vId]; return n; });
    }

    async function saveRowEdit(v) {
        const vId = getEntryId(v);
        const edit = rowEdits[vId];
        if (!edit) return;
        const patch = {};
        for (const [k, val] of Object.entries(edit)) {
            if (k === 'selling_price' || k === 'offer_price') {
                patch[k] = val === '' || val == null ? null : parseFloat(val);
            } else {
                patch[k] = val;
            }
        }
        setRowSaving(prev => ({ ...prev, [vId]: true }));
        try {
            await ProductsEndpoints.update(vId, patch);
            await loadProductDetails(getEntryId(selectedProduct));
            setRowEdits(prev => { const n = { ...prev }; delete n[vId]; return n; });
            setSuccess(`Variant "${edit.name ?? v.name}" updated`);
        } catch (err) {
            console.error('Row save failed', err);
            setError('Failed to save variant');
        } finally {
            setRowSaving(prev => ({ ...prev, [vId]: false }));
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
                        const res = await StockItemsEndpoints.byProduct(vId, { page, pageSize: 100 });
                        const items = res?.data ?? res ?? [];
                        totalPages = res?.meta?.pagination?.pageCount || 1;
                        for (const item of items) {
                            await StockItemsEndpoints.update(getEntryId(item), {
                                product: { connect: [parentDocumentId], disconnect: [vId] }, name: selectedProduct.name
                            });
                        }
                        page++;
                    } while (page <= totalPages);
                }
                await ProductsEndpoints.del(vId);
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
                await StockItemsEndpoints.update(id, {
                    product: { set: [getEntryId(variant)] },
                    name: variant.name
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

    function handleTermTypeDialogConfirm({ termType, selectedTerms }) {
        const ttId = getEntryId(termType);
        // Merge the confirmed term type into local state if not already present
        setTermTypes(prev => {
            const exists = prev.some(t => getEntryId(t) === ttId);
            if (exists) {
                // Update the terms list for this type with any newly created terms
                return prev.map(t => getEntryId(t) === ttId ? { ...t, terms: termType.terms || t.terms } : t);
            }
            return [...prev, termType];
        });
        setSelectedTermTypeId(ttId);
        setShowTermTypeDialog(false);
        // Reload term types to get fresh data
        loadTermTypes();
    }

    const statusPill = selectedProduct?.is_active === false
        ? <span className="badge bg-secondary">Inactive</span>
        : selectedProduct ? <span className="badge bg-success">Active</span> : null;

    const headerActions = (
        <Link href={`/${documentId}/catalogue-import`} className="btn btn-outline-secondary btn-sm">
            <i className="fas fa-file-pdf me-1" /> Catalogue Import
        </Link>
    );

    return (
        <ProtectedRoute>
            <Layout>
                <ProductPageShell
                    product={selectedProduct}
                    backHref="/products"
                    tabs={buildStockProductTabs({ documentId, badges: { variants: variants.length || undefined } })}
                    currentTab="variants"
                    statusPill={statusPill}
                    extraInfo={selectedProduct && (
                        <>
                            <span><i className="fas fa-layer-group me-1 opacity-50" />{variants.length} variant{variants.length === 1 ? '' : 's'}</span>
                            {stockItems.length > 0 && (
                                <span><i className="fas fa-cubes me-1 opacity-50" />{stockItems.length} parent item{stockItems.length === 1 ? '' : 's'}</span>
                            )}
                        </>
                    )}
                    actions={headerActions}
                    alert={{
                        error,
                        success,
                        onDismissError: () => setError(''),
                        onDismissSuccess: () => setSuccess(''),
                    }}
                >
                    {loading && <div className="alert alert-info py-2"><i className="fas fa-spinner fa-spin me-2" />Processing...</div>}

                    {/* Existing Variants */}
                    <div className="card mb-3">
                        <div className="card-header d-flex justify-content-between align-items-center py-2">
                            <h6 className="mb-0"><i className="fas fa-list me-2" />Variants ({variants.length})</h6>
                            {variants.length > 0 && (
                                <div className="d-flex gap-2">
                                    <button className="btn btn-outline-primary btn-sm" type="button" onClick={selectAllVariants}>
                                        {selectedVariants.size === variants.length ? 'Unselect All' : 'Select All'}
                                    </button>
                                    {selectedVariants.size > 0 && (
                                        <>
                                            <button className="btn btn-outline-warning btn-sm" type="button" onClick={handleBulkMergeVariantsToParent} disabled={loading} title="Move stock items back to the parent and remove the selected variants">
                                                <i className="fas fa-code-merge me-1" />Merge to Parent ({selectedVariants.size})
                                            </button>
                                            <button className="btn btn-outline-danger btn-sm" type="button" onClick={handleBulkDeleteVariants} disabled={loading}>
                                                <i className="fas fa-trash me-1" />Delete Selected ({selectedVariants.size})
                                            </button>
                                        </>
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
                                                <th style={{ width: '48px' }}></th>
                                                <th>Name</th>
                                                <th>Terms</th>
                                                <th>SKU</th>
                                                <th>Barcode</th>
                                                <th className="text-end">Selling</th>
                                                <th className="text-end">Offer</th>
                                                <th className="text-center">Stock</th>
                                                <th className="text-center">Active</th>
                                                <th style={{ width: '240px' }}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {variants.map(v => {
                                                const vId = getEntryId(v);
                                                const stockCount = variantStockCounts[vId] ?? '...';
                                                const termNames = (v.terms || []).map(t => t.name).join(', ');
                                                const thumbImg = v.logo || (v.gallery && v.gallery[0]) || null;
                                                const thumbSrc = thumbImg ? MediaUtilsEndpoints.strapiImageUrl(thumbImg) : null;
                                                const dirty = isRowDirty(v);
                                                const saving = !!rowSaving[vId];
                                                const activeChecked = getRowValue(v, 'is_active') !== false;
                                                return (
                                                    <tr key={vId} className={dirty ? 'table-warning' : ''}>
                                                        <td>
                                                            <input
                                                                type="checkbox"
                                                                className="form-check-input"
                                                                checked={selectedVariants.has(vId)}
                                                                onChange={() => toggleSelectVariant(vId)}
                                                            />
                                                        </td>
                                                        <td>
                                                            {thumbSrc ? (
                                                                <img
                                                                    src={thumbSrc}
                                                                    alt={v.name || ''}
                                                                    style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4 }}
                                                                />
                                                            ) : (
                                                                <div
                                                                    className="d-flex align-items-center justify-content-center text-muted bg-light"
                                                                    style={{ width: 36, height: 36, borderRadius: 4 }}
                                                                    title="No image"
                                                                >
                                                                    <i className="fas fa-image" style={{ fontSize: '0.85em' }} />
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td>
                                                            <input
                                                                className="form-control form-control-sm"
                                                                value={getRowValue(v, 'name')}
                                                                onChange={e => setRowValue(vId, 'name', e.target.value)}
                                                            />
                                                        </td>
                                                        <td>
                                                            {termNames ? termNames.split(', ').map((tn, i) => (
                                                                <span key={i} className="badge bg-light text-dark border me-1">{tn}</span>
                                                            )) : <span className="text-muted">—</span>}
                                                        </td>
                                                        <td>
                                                            <input
                                                                className="form-control form-control-sm"
                                                                value={getRowValue(v, 'sku')}
                                                                onChange={e => setRowValue(vId, 'sku', e.target.value)}
                                                            />
                                                        </td>
                                                        <td>
                                                            <input
                                                                className="form-control form-control-sm"
                                                                value={getRowValue(v, 'barcode')}
                                                                onChange={e => setRowValue(vId, 'barcode', e.target.value)}
                                                            />
                                                        </td>
                                                        <td>
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                className="form-control form-control-sm text-end"
                                                                value={getRowValue(v, 'selling_price')}
                                                                onChange={e => setRowValue(vId, 'selling_price', e.target.value)}
                                                            />
                                                        </td>
                                                        <td>
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                className="form-control form-control-sm text-end"
                                                                value={getRowValue(v, 'offer_price')}
                                                                onChange={e => setRowValue(vId, 'offer_price', e.target.value)}
                                                            />
                                                        </td>
                                                        <td className="text-center">
                                                            <span className={`badge ${stockCount > 0 ? 'bg-success' : 'bg-secondary'}`}>{stockCount}</span>
                                                        </td>
                                                        <td className="text-center">
                                                            <input
                                                                type="checkbox"
                                                                className="form-check-input"
                                                                checked={activeChecked}
                                                                onChange={e => setRowValue(vId, 'is_active', e.target.checked)}
                                                            />
                                                        </td>
                                                        <td>
                                                            <div className="btn-group btn-group-sm">
                                                                {dirty ? (
                                                                    <>
                                                                        <button className="btn btn-primary" type="button" title="Save changes" disabled={saving} onClick={() => saveRowEdit(v)}>
                                                                            {saving ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-save" />}
                                                                        </button>
                                                                        <button className="btn btn-outline-secondary" type="button" title="Discard changes" disabled={saving} onClick={() => cancelRowEdit(vId)}>
                                                                            <i className="fas fa-times" />
                                                                        </button>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                <Link href={`/${vId}/product-edit`} className="btn btn-outline-primary" title="Edit variant">
                                                                    <i className="fas fa-edit" />
                                                                </Link>
                                                                <Link href={`/stock-items?product=${vId}`} className="btn btn-outline-info" title="View stock items">
                                                                    <i className="fas fa-barcode" />
                                                                </Link>
                                                                <button
                                                                    className="btn btn-outline-info"
                                                                    type="button"
                                                                    title="Copy parent's images into this variant's gallery"
                                                                    onClick={() => copyParentImagesToVariant(v)}
                                                                    disabled={loading || (selectedProduct?.gallery || []).length === 0}
                                                                >
                                                                    <i className="fas fa-cloud-download-alt" />
                                                                </button>
                                                                <button
                                                                    className="btn btn-outline-info"
                                                                    type="button"
                                                                    title="Copy this variant's images up to the parent's gallery"
                                                                    onClick={() => copyVariantImagesToParent(v)}
                                                                    disabled={loading || (v.gallery || []).length === 0}
                                                                >
                                                                    <i className="fas fa-cloud-upload-alt" />
                                                                </button>
                                                                <button className="btn btn-outline-warning" type="button" title="Merge into parent (move stock to parent, then remove)" onClick={() => handleMergeVariantToParent(v)} disabled={loading}>
                                                                    <i className="fas fa-code-merge" />
                                                                </button>
                                                                <button className="btn btn-outline-danger" type="button" title="Delete variant" onClick={() => handleDeleteVariant(v)} disabled={loading}>
                                                                    <i className="fas fa-trash" />
                                                                </button>
                                                                    </>
                                                                )}
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
                            <h6 className="mb-0"><i className="fas fa-plus-circle me-2" />Create Variants by Term Type</h6>
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
                                    <div className="input-group input-group-sm">
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
                                        <button
                                            className="btn btn-outline-primary"
                                            type="button"
                                            onClick={() => setShowTermTypeDialog(true)}
                                            title="Browse & manage term types and terms"
                                        >
                                            <i className="fas fa-tags" />
                                        </button>
                                    </div>
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

                    {/* Product & Variant Terms */}
                    <div className="card mb-3">
                        <div className="card-header py-2">
                            <h6 className="mb-0"><i className="fas fa-tags me-2" />Product &amp; Variant Terms</h6>
                        </div>
                        <div className="card-body">
                            <ProductVariantManager
                                productId={documentId}
                                onUpdate={() => loadProductDetails(documentId)}
                            />
                        </div>
                    </div>

                    <TermTypeTermDialog
                        show={showTermTypeDialog}
                        onClose={() => setShowTermTypeDialog(false)}
                        onConfirm={handleTermTypeDialogConfirm}
                        variantOnly={true}
                    />

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
                </ProductPageShell>
            </Layout>
        </ProtectedRoute>
    );
}

