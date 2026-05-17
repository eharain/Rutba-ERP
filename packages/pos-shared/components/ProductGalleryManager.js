import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { StraipImageUrl, isImage, relationConnects } from "@rutba/api-provider/lib/api";
import { ProductsEndpoints, UploadEndpoints, TermTypesEndpoints, StockItemsEndpoints, PurchaseItemsEndpoints } from '@rutba/api-provider/endpoints/index.js';
import { createVariant } from '../lib/variants';
import StrapiMediaLibrary from './StrapiMediaLibrary';
import TermTypeTermDialog from './TermTypeTermDialog';

function getEntryId(entry) {
    return entry?.documentId || entry?.id;
}

export default function ProductGalleryManager({ productId, onUpdate }) {
    const [product, setProduct] = useState(null);
    const [variants, setVariants] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Selection state
    const [selectedParentImages, setSelectedParentImages] = useState(new Set());

    // Per-row inline edits for the Variants table: { [variantDocId]: { name?, sku?, barcode?, selling_price?, offer_price?, is_active? } }
    const [rowEdits, setRowEdits] = useState({});
    const [rowSaving, setRowSaving] = useState({});

    // Action state
    const [targetVariantId, setTargetVariantId] = useState('');
    const [showCreateVariant, setShowCreateVariant] = useState(false);
    const [newVariantName, setNewVariantName] = useState('');

    // Upload
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef();

    // Media library picker
    const [showMediaLibrary, setShowMediaLibrary] = useState(false);
    const [mediaLibraryTarget, setMediaLibraryTarget] = useState(null); // null = parent, variantDocId = variant

    // --- Term-type variant creation ---
    const [showTermTypeDialog, setShowTermTypeDialog] = useState(false);
    const [termTypes, setTermTypes] = useState([]);
    const [selectedTermTypeId, setSelectedTermTypeId] = useState('');
    const [termForms, setTermForms] = useState({});
    const [nameAffix, setNameAffix] = useState('suffix');
    const [variantBaseName, setVariantBaseName] = useState('');
    const [bulkCreating, setBulkCreating] = useState(false);

    useEffect(() => {
        if (success || error) {
            const timer = setTimeout(() => { setSuccess(''); setError(''); }, 5000);
            return () => clearTimeout(timer);
        }
    }, [success, error]);

    const loadData = useCallback(async () => {
        if (!productId) return;
        setLoading(true);
        try {
            // byIdDraft + explicit variants populate: byId() defaults to
            // status=published and its default populate omits `variants`, so
            // we'd see zero variants when only drafts exist (and we wouldn't
            // see their gallery/terms even after publish).
            const res = await ProductsEndpoints.byIdDraft(productId, {
                populate: {
                    logo: true,
                    gallery: true,
                    terms: true,
                    variants: { populate: { logo: true, gallery: true, terms: true } },
                },
            });
            const prod = res.data || res;
            setProduct(prod);
            const loadedVariants = prod.variants || [];
            setVariants(loadedVariants);
            setSelectedParentImages(new Set());
            setRowEdits({});
        } catch (err) {
            console.error('Failed to load product gallery data', err);
            setError('Failed to load gallery data');
        } finally {
            setLoading(false);
        }
    }, [productId]);

    useEffect(() => { loadData(); }, [loadData]);

    const parentGallery = product?.gallery || [];

    // --- Selection helpers ---

    function toggleParentImage(imageId) {
        setSelectedParentImages(prev => {
            const s = new Set(prev);
            s.has(imageId) ? s.delete(imageId) : s.add(imageId);
            return s;
        });
    }

    function selectAllParentImages() {
        if (selectedParentImages.size === parentGallery.length) {
            setSelectedParentImages(new Set());
        } else {
            setSelectedParentImages(new Set(parentGallery.map(img => img.id)));
        }
    }

    // --- Per-row inline editing for the Variants table ---

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

    async function saveRowEdit(v) {
        const vId = getEntryId(v);
        const edit = rowEdits[vId];
        if (!edit) return;
        // Numeric fields → numbers (or null when cleared). is_active stays as boolean. Strings pass through.
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
            await loadData();
            if (onUpdate) onUpdate();
            setRowEdits(prev => { const n = { ...prev }; delete n[vId]; return n; });
            setSuccess(`Variant "${edit.name ?? v.name}" updated`);
        } catch (err) {
            console.error('Row save failed', err);
            setError('Failed to save variant');
        } finally {
            setRowSaving(prev => ({ ...prev, [vId]: false }));
        }
    }

    function cancelRowEdit(vId) {
        setRowEdits(prev => { const n = { ...prev }; delete n[vId]; return n; });
    }

    // --- Copy images between a variant and the parent (non-destructive) ---

    async function copyParentImagesToVariant(v) {
        const vId = getEntryId(v);
        const variantGallery = v.gallery || [];
        const parentGalleryItems = product?.gallery || [];
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
            await loadData();
            if (onUpdate) onUpdate();
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
        const parentGalleryItems = product?.gallery || [];
        if (variantGallery.length === 0) return setError(`"${v.name}" has no images to copy`);
        const existing = new Set(parentGalleryItems.map(g => g.id));
        const newIds = variantGallery.map(g => g.id).filter(id => !existing.has(id));
        if (newIds.length === 0) return setError('Parent already has all of this variant\'s images');
        if (!confirm(`Copy ${newIds.length} image(s) from "${v.name}" up to the parent?`)) return;
        setLoading(true);
        try {
            await ProductsEndpoints.update(getEntryId(product), {
                gallery: [...parentGalleryItems.map(g => g.id), ...newIds],
            });
            await loadData();
            if (onUpdate) onUpdate();
            setSuccess(`Copied ${newIds.length} image(s) from "${v.name}" to parent`);
        } catch (err) {
            console.error('Copy to parent failed', err);
            setError('Failed to copy images to parent');
        } finally {
            setLoading(false);
        }
    }

    // --- Merge a variant back into the parent ---
    // Mirrors the ProductMergeTool's "Merge Variants Into Parent" flow, but
    // exposed inline on the variant list so users don't have to switch tabs.
    // Always transfers stock items + purchase items, then deletes the variant.
    async function mergeVariantIntoParent(variant) {
        const vId = getEntryId(variant);
        const parentDocId = getEntryId(product);
        if (!confirm(`Merge variant "${variant.name}" into "${product.name}"?\n\nStock items and purchase items will move to the parent, and this variant will be removed.`)) return;
        setLoading(true);
        try {
            // Transfer stock items
            let page = 1, totalPages = 1, stockCount = 0;
            do {
                const res = await StockItemsEndpoints.byProduct(vId, { page, pageSize: 100 });
                const items = res?.data ?? res ?? [];
                totalPages = res?.meta?.pagination?.pageCount || 1;
                for (const item of items) {
                    await StockItemsEndpoints.update(getEntryId(item), {
                        product: { connect: [parentDocId], disconnect: [vId] }, name: product.name
                    });
                    stockCount++;
                }
                page++;
            } while (page <= totalPages);
            // Transfer purchase items
            page = 1; totalPages = 1; let purchaseCount = 0;
            do {
                const res = await PurchaseItemsEndpoints.byProduct(vId, { page, pageSize: 100 });
                const items = res?.data ?? res ?? [];
                totalPages = res?.meta?.pagination?.pageCount || 1;
                for (const item of items) {
                    await PurchaseItemsEndpoints.update(getEntryId(item), {
                        product: { connect: [parentDocId], disconnect: [vId] },
                    });
                    purchaseCount++;
                }
                page++;
            } while (page <= totalPages);
            await ProductsEndpoints.del(vId);
            await loadData();
            if (onUpdate) onUpdate();
            setSuccess(`Merged "${variant.name}" into parent (${stockCount} stock + ${purchaseCount} purchase item(s) moved)`);
        } catch (err) {
            console.error('Failed to merge variant into parent', err);
            setError('Failed to merge variant into parent');
        } finally {
            setLoading(false);
        }
    }

    // --- Upload ---

    async function handleUpload(e) {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        setUploading(true);
        try {
            await UploadEndpoints.uploadFiles(
                files, 'product', 'gallery', product.id,
                { name: product.name, alt: product.name, caption: product.name }
            );
            await loadData();
            if (onUpdate) onUpdate();
            setSuccess(`Uploaded ${files.length} image(s)`);
        } catch (err) {
            console.error('Upload failed', err);
            setError('Failed to upload images');
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    }

    // --- Add from media library ---

    function openMediaLibrary(target) {
        setMediaLibraryTarget(target);
        setShowMediaLibrary(true);
    }

    async function handleMediaLibrarySelect(selectedFiles) {
        if (!selectedFiles || selectedFiles.length === 0) return;
        setLoading(true);
        try {
            if (!mediaLibraryTarget) {
                // Add to parent gallery
                const existingIds = new Set(parentGallery.map(g => g.id));
                const newIds = selectedFiles.map(f => f.id).filter(id => !existingIds.has(id));
                if (newIds.length > 0) {
                    const updatedGallery = [...parentGallery.map(g => g.id), ...newIds];
                    await ProductsEndpoints.update(getEntryId(product), {
                        gallery: updatedGallery
                    });
                }
                setSuccess(`Added ${newIds.length} image(s) from media library`);
            } else {
                // Add to variant gallery
                const variant = variants.find(v => getEntryId(v) === mediaLibraryTarget);
                if (!variant) { setError('Variant not found'); return; }
                const vGallery = variant.gallery || [];
                const existingIds = new Set(vGallery.map(g => g.id));
                const newIds = selectedFiles.map(f => f.id).filter(id => !existingIds.has(id));
                if (newIds.length > 0) {
                    const updatedGallery = [...vGallery.map(g => g.id), ...newIds];
                    await ProductsEndpoints.update(mediaLibraryTarget, {
                        gallery: updatedGallery
                    });
                }
                setSuccess(`Added ${newIds.length} image(s) to "${variant.name}" from media library`);
            }
            await loadData();
            if (onUpdate) onUpdate();
        } catch (err) {
            console.error('Failed to add images from media library', err);
            setError('Failed to add images from media library');
        } finally {
            setLoading(false);
        }
    }

    // --- Move images from parent → variant ---

    async function moveToVariant(variantDocId) {
        if (selectedParentImages.size === 0) return setError('Select images first');
        const variant = variants.find(v => getEntryId(v) === variantDocId);
        if (!variant) return setError('Variant not found');

        setLoading(true);
        try {
            const imagesToMove = Array.from(selectedParentImages);
            const remainingParentGallery = parentGallery.filter(img => !selectedParentImages.has(img.id));
            const variantGallery = variant.gallery || [];
            const existingIds = new Set(variantGallery.map(g => g.id));
            const newIds = imagesToMove.filter(id => !existingIds.has(id));
            const newVariantGallery = [...variantGallery.map(g => g.id), ...newIds];

            await ProductsEndpoints.update(getEntryId(product), {
                gallery: remainingParentGallery.map(g => g.id)
            });
            await ProductsEndpoints.update(variantDocId, {
                gallery: newVariantGallery
            });

            await loadData();
            if (onUpdate) onUpdate();
            setTargetVariantId('');
            setSuccess(`Moved ${imagesToMove.length} image(s) to "${variant.name}"`);
        } catch (err) {
            console.error('Failed to move images', err);
            setError('Failed to move images');
        } finally {
            setLoading(false);
        }
    }

    // --- Copy images from parent → variant (parent keeps them) ---

    async function copyToVariant(variantDocId) {
        if (selectedParentImages.size === 0) return setError('Select images first');
        const variant = variants.find(v => getEntryId(v) === variantDocId);
        if (!variant) return setError('Variant not found');

        setLoading(true);
        try {
            const imagesToCopy = Array.from(selectedParentImages);
            const variantGallery = variant.gallery || [];
            const existingIds = new Set(variantGallery.map(g => g.id));
            const newIds = imagesToCopy.filter(id => !existingIds.has(id));
            const newVariantGallery = [...variantGallery.map(g => g.id), ...newIds];

            await ProductsEndpoints.update(variantDocId, {
                gallery: newVariantGallery
            });

            await loadData();
            if (onUpdate) onUpdate();
            setTargetVariantId('');
            setSuccess(`Copied ${newIds.length} image(s) to "${variant.name}"`);
        } catch (err) {
            console.error('Failed to copy images', err);
            setError('Failed to copy images');
        } finally {
            setLoading(false);
        }
    }

    // --- Create variant from selected parent images ---

    async function createVariantFromImages() {
        if (selectedParentImages.size === 0) return setError('Select images first');
        if (!newVariantName.trim()) return setError('Enter a variant name');

        setLoading(true);
        try {
            const parentDocId = getEntryId(product);
            const imagesToAssign = Array.from(selectedParentImages);
            const remainingParentGallery = parentGallery
                .filter(img => !selectedParentImages.has(img.id))
                .map(g => g.id);

            await createVariant(parentDocId, 'gallery-image', {
                variantName: newVariantName.trim(),
                imageIds: imagesToAssign,
                parentRemainingGalleryIds: remainingParentGallery,
                sku: product.sku,
                barcode: product.barcode,
                selling_price: product.selling_price,
                offer_price: product.offer_price,
                is_active: product.is_active,
            });

            await loadData();
            if (onUpdate) onUpdate();
            setNewVariantName('');
            setShowCreateVariant(false);
            setSuccess(`Variant "${newVariantName.trim()}" created with ${imagesToAssign.length} image(s)`);
        } catch (err) {
            console.error('Failed to create variant from images', err);
            setError('Failed to create variant');
        } finally {
            setLoading(false);
        }
    }

    // --- Create individual variant per image (one variant per selected image) ---

    async function createVariantPerImage() {
        if (selectedParentImages.size === 0) return setError('Select images first');
        const baseName = newVariantName.trim() || product?.name || 'Variant';
        if (!confirm(`Create ${selectedParentImages.size} variant(s), one per selected image?`)) return;

        setLoading(true);
        let created = 0;
        try {
            const parentDocId = getEntryId(product);
            const selectedIds = Array.from(selectedParentImages);
            const selectedImages = parentGallery.filter(img => selectedParentImages.has(img.id));

            // Remove assigned images from parent — pre-compute once; the helper
            // applies this update after the last variant create. We pass an empty
            // array for intermediate creates so the parent gallery only gets
            // rewritten on the final iteration (avoids N parent updates).
            const remainingParentGalleryIds = parentGallery
                .filter(img => !selectedParentImages.has(img.id))
                .map(g => g.id);

            for (let i = 0; i < selectedImages.length; i++) {
                const img = selectedImages[i];
                const variantName = selectedImages.length > 1
                    ? `${baseName} - ${i + 1}`
                    : baseName;
                const isLast = i === selectedImages.length - 1;
                await createVariant(parentDocId, 'gallery-image', {
                    variantName,
                    imageIds: [img.id],
                    parentRemainingGalleryIds: isLast ? remainingParentGalleryIds : undefined,
                    sku: product.sku,
                    barcode: product.barcode,
                    selling_price: product.selling_price,
                    offer_price: product.offer_price,
                    is_active: product.is_active,
                });
                created++;
            }

            await loadData();
            if (onUpdate) onUpdate();
            setNewVariantName('');
            setShowCreateVariant(false);
            setSuccess(`Created ${created} variant(s) from individual images`);
        } catch (err) {
            console.error('Failed to create variants per image', err);
            setError(`Failed after creating ${created} variant(s)`);
        } finally {
            setLoading(false);
        }
    }

    // --- Term-type variant creation ---

    const loadTermTypes = useCallback(async () => {
        try {
            const res = await TermTypesEndpoints.listVariants();
            const types = res?.data ?? res;
            setTermTypes(types || []);
        } catch (err) {
            console.error('Failed to load term types', err);
        }
    }, []);

    useEffect(() => { loadTermTypes(); }, [loadTermTypes]);

    useEffect(() => {
        if (product && !variantBaseName) {
            setVariantBaseName(product.name || '');
        }
    }, [product]);

    function buildVariantName(termName) {
        const baseName = variantBaseName || product?.name || '';
        if (!termName) return baseName;
        if (!baseName) return termName;
        return nameAffix === 'prefix'
            ? `${termName} - ${baseName}`
            : `${baseName} - ${termName}`;
    }

    function getDefaultVariantForm() {
        return {
            sku: product?.sku || '',
            barcode: product?.barcode || '',
            selling_price: product?.selling_price ?? 0,
            offer_price: product?.offer_price ?? 0,
            is_active: product?.is_active ?? true,
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
                [field]: value,
            },
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

    async function handleCreateVariantByTerm(term) {
        if (!product) return setError('Missing product');
        const selectedTermType = termTypes.find(t => getEntryId(t) === selectedTermTypeId);
        if (!selectedTermType) return setError('Choose a term type');
        if (!term) return setError('Choose a term');
        if (isTermAlreadyVariant(term)) return setError('Variant already exists for this term');
        const formValues = getTermForm(getEntryId(term));
        try {
            setLoading(true);
            const parentDocumentId = getEntryId(product);
            // 'term-gallery' mode = same payload as 'term', but never touches stock items.
            // This component is mounted in a publishing/gallery context (rutba-cms) where
            // stock-item migration is out of scope.
            const created = await createVariant(parentDocumentId, 'term-gallery', {
                term,
                baseName: variantBaseName || product?.name || '',
                namingMode: nameAffix,
                sku: formValues.sku,
                barcode: formValues.barcode,
                selling_price: formValues.selling_price,
                offer_price: formValues.offer_price,
                is_active: formValues.is_active,
            });
            await loadData();
            if (onUpdate) onUpdate();
            setTermForms(prev => ({ ...prev, [getEntryId(term)]: getDefaultVariantForm() }));
            setSuccess(`Variant "${created.name || buildVariantName(term.name)}" created`);
        } catch (err) {
            console.error('Failed to create variant', err);
            setError('Failed to create variant');
        } finally {
            setLoading(false);
        }
    }

    async function handleBulkCreateVariantsByTerm() {
        const creatableTerms = getCreatableTerms();
        if (creatableTerms.length === 0) return setError('No new variants to create');
        if (!confirm(`Create ${creatableTerms.length} variant(s)?`)) return;
        setBulkCreating(true);
        setLoading(true);
        let created = 0;
        try {
            const parentDocumentId = getEntryId(product);
            for (const term of creatableTerms) {
                const formValues = getTermForm(getEntryId(term));
                await createVariant(parentDocumentId, 'term-gallery', {
                    term,
                    baseName: variantBaseName || product?.name || '',
                    namingMode: nameAffix,
                    sku: formValues.sku,
                    barcode: formValues.barcode,
                    selling_price: formValues.selling_price,
                    offer_price: formValues.offer_price,
                    is_active: formValues.is_active,
                });
                created++;
            }
            await loadData();
            if (onUpdate) onUpdate();
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

    function handleTermTypeDialogConfirm({ termType, selectedTerms }) {
        const ttId = getEntryId(termType);
        setTermTypes(prev => {
            const exists = prev.some(t => getEntryId(t) === ttId);
            if (exists) {
                return prev.map(t => getEntryId(t) === ttId ? { ...t, terms: termType.terms || t.terms } : t);
            }
            return [...prev, termType];
        });
        setSelectedTermTypeId(ttId);
        setShowTermTypeDialog(false);
        loadTermTypes();
    }

    const selectedTermType = termTypes.find(t => getEntryId(t) === selectedTermTypeId);
    const currentTerms = selectedTermType?.terms || [];
    const creatableTerms = getCreatableTerms();

    // --- Render helpers ---

    function renderImageThumbnail(img, selected, onClick) {
        return (
            <div
                key={img.id}
                onClick={onClick}
                style={{
                    width: 110, height: 110,
                    position: 'relative',
                    cursor: 'pointer',
                    border: selected ? '3px solid #0d6efd' : '2px solid #dee2e6',
                    borderRadius: 8,
                    overflow: 'hidden',
                    flexShrink: 0,
                    transition: 'border-color 0.15s',
                }}
            >
                {isImage(img) ? (
                    <img
                        src={StraipImageUrl(img)}
                        alt={img.name || ''}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                ) : (
                    <div className="d-flex align-items-center justify-content-center h-100 bg-light">
                        <i className="fas fa-file fa-2x text-muted" />
                    </div>
                )}
                <div style={{
                    position: 'absolute', top: 4, left: 4,
                    width: 22, height: 22,
                    borderRadius: 4,
                    background: selected ? '#0d6efd' : 'rgba(255,255,255,0.85)',
                    border: selected ? 'none' : '2px solid #adb5bd',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    {selected && <i className="fas fa-check text-white" style={{ fontSize: 11 }} />}
                </div>
            </div>
        );
    }

    if (!product) {
        return loading
            ? <div className="text-center py-4"><i className="fas fa-spinner fa-spin me-2" />Loading gallery...</div>
            : null;
    }

    const hasSelectedParent = selectedParentImages.size > 0;

    return (
        <div>
            {error && (
                <div className="alert alert-danger alert-dismissible py-2">
                    {error}
                    <button type="button" className="btn-close" onClick={() => setError('')} />
                </div>
            )}
            {success && (
                <div className="alert alert-success alert-dismissible py-2">
                    {success}
                    <button type="button" className="btn-close" onClick={() => setSuccess('')} />
                </div>
            )}
            {loading && (
                <div className="alert alert-info py-2">
                    <i className="fas fa-spinner fa-spin me-2" />Processing...
                </div>
            )}

            {/* =============== VARIANTS LIST (compact) =============== */}
            {variants.length > 0 && (
                <div className="card mb-3">
                    <div className="card-header py-2">
                        <h6 className="mb-0">
                            <i className="fas fa-list me-2" />
                            Variants ({variants.length})
                        </h6>
                    </div>
                    <div className="card-body p-0">
                        <div className="table-responsive">
                            <table className="table table-sm align-middle mb-0">
                                <thead className="table-light">
                                    <tr>
                                        <th style={{ width: 48 }}></th>
                                        <th>Name</th>
                                        <th>Terms</th>
                                        <th>SKU</th>
                                        <th>Barcode</th>
                                        <th className="text-end">Selling</th>
                                        <th className="text-end">Offer</th>
                                        <th className="text-center">Images</th>
                                        <th className="text-center">Active</th>
                                        <th style={{ width: '180px' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {variants.map(v => {
                                        const vId = getEntryId(v);
                                        const termNames = (v.terms || []).map(t => t.name).join(', ');
                                        const imgCount = (v.gallery || []).length;
                                        const thumbSrc = v.logo
                                            ? StraipImageUrl(v.logo)
                                            : (v.gallery && v.gallery[0] ? StraipImageUrl(v.gallery[0]) : null);
                                        const dirty = isRowDirty(v);
                                        const saving = !!rowSaving[vId];
                                        const activeChecked = getRowValue(v, 'is_active') !== false;
                                        return (
                                            <tr key={vId} className={dirty ? 'table-warning' : ''}>
                                                <td>
                                                    <Link href={`/${vId}/product`} title="Open variant">
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
                                                            >
                                                                <i className="fas fa-image" style={{ fontSize: '0.85em' }} />
                                                            </div>
                                                        )}
                                                    </Link>
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
                                                    <span className={`badge ${imgCount > 0 ? 'bg-success' : 'bg-secondary'}`}>{imgCount}</span>
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
                                                        {dirty && (
                                                            <>
                                                                <button
                                                                    className="btn btn-primary"
                                                                    type="button"
                                                                    title="Save changes"
                                                                    disabled={saving}
                                                                    onClick={() => saveRowEdit(v)}
                                                                >
                                                                    {saving ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-save" />}
                                                                </button>
                                                                <button
                                                                    className="btn btn-outline-secondary"
                                                                    type="button"
                                                                    title="Discard changes"
                                                                    disabled={saving}
                                                                    onClick={() => cancelRowEdit(vId)}
                                                                >
                                                                    <i className="fas fa-times" />
                                                                </button>
                                                            </>
                                                        )}
                                                        {!dirty && (
                                                            <>
                                                                <Link
                                                                    href={`/${vId}/product`}
                                                                    className="btn btn-outline-primary"
                                                                    title="Open variant for editing (includes gallery)"
                                                                >
                                                                    <i className="fas fa-external-link-alt" />
                                                                </Link>
                                                                <button
                                                                    className="btn btn-outline-info"
                                                                    type="button"
                                                                    title="Copy parent's images into this variant's gallery"
                                                                    onClick={() => copyParentImagesToVariant(v)}
                                                                    disabled={loading || (product?.gallery || []).length === 0}
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
                                                                <button
                                                                    className="btn btn-outline-warning"
                                                                    type="button"
                                                                    title="Merge into parent (move stock + purchase items, remove variant)"
                                                                    onClick={() => mergeVariantIntoParent(v)}
                                                                    disabled={loading}
                                                                >
                                                                    <i className="fas fa-compress" />
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
                    </div>
                </div>
            )}

            {/* =============== PARENT GALLERY =============== */}
            <div className="card mb-3">
                <div className="card-header d-flex justify-content-between align-items-center py-2">
                    <h6 className="mb-0">
                        <i className="fas fa-images me-2" />
                        Product Gallery ({parentGallery.length})
                        {hasSelectedParent && (
                            <span className="badge bg-primary ms-2">{selectedParentImages.size} selected</span>
                        )}
                    </h6>
                    <div className="d-flex gap-2">
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept="image/*"
                            className="d-none"
                            onChange={handleUpload}
                        />
                        <button
                            className="btn btn-sm btn-outline-primary"
                            type="button"
                            onClick={() => fileInputRef.current.click()}
                            disabled={uploading}
                        >
                            <i className="fas fa-upload me-1" />{uploading ? 'Uploading...' : 'Upload Images'}
                        </button>
                        <button
                            className="btn btn-sm btn-outline-secondary"
                            type="button"
                            onClick={() => openMediaLibrary(null)}
                        >
                            <i className="fas fa-photo-video me-1" />Media Library
                        </button>
                        {parentGallery.length > 0 && (
                            <button className="btn btn-sm btn-outline-secondary" type="button" onClick={selectAllParentImages}>
                                {selectedParentImages.size === parentGallery.length ? 'Deselect All' : 'Select All'}
                            </button>
                        )}
                    </div>
                </div>
                <div className="card-body">
                    {parentGallery.length === 0 ? (
                        <div className="text-muted text-center py-3">
                            <i className="fas fa-cloud-upload-alt fa-2x mb-2 d-block" />
                            No images yet. Upload images to get started.
                        </div>
                    ) : (
                        <div className="d-flex flex-wrap gap-2">
                            {parentGallery.map(img =>
                                renderImageThumbnail(img, selectedParentImages.has(img.id), () => toggleParentImage(img.id))
                            )}
                        </div>
                    )}

                    {/* --- Parent action bar --- */}
                    {hasSelectedParent && (
                        <div className="mt-3 p-3 bg-light rounded border">
                            <div className="d-flex flex-wrap gap-2 align-items-center mb-2">
                                <span className="fw-bold small">
                                    <i className="fas fa-hand-pointer me-1" />
                                    {selectedParentImages.size} image(s) selected
                                </span>
                            </div>

                            {/* Move / Copy to existing variant */}
                            {variants.length > 0 && (
                                <div className="d-flex flex-wrap gap-2 align-items-center mb-2">
                                    <select
                                        className="form-select form-select-sm"
                                        style={{ maxWidth: 220 }}
                                        value={targetVariantId}
                                        onChange={e => setTargetVariantId(e.target.value)}
                                    >
                                        <option value="">Choose variant...</option>
                                        {variants.map(v => (
                                            <option key={getEntryId(v)} value={getEntryId(v)}>
                                                {v.name} ({(v.gallery || []).length} imgs)
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        className="btn btn-sm btn-primary"
                                        type="button"
                                        disabled={!targetVariantId || loading}
                                        onClick={() => moveToVariant(targetVariantId)}
                                        title="Move images to variant (removes from parent)"
                                    >
                                        <i className="fas fa-arrow-down me-1" />Move
                                    </button>
                                    <button
                                        className="btn btn-sm btn-outline-primary"
                                        type="button"
                                        disabled={!targetVariantId || loading}
                                        onClick={() => copyToVariant(targetVariantId)}
                                        title="Copy images to variant (keeps in parent)"
                                    >
                                        <i className="fas fa-copy me-1" />Copy
                                    </button>
                                </div>
                            )}

                            {/* Create variant from images */}
                            <div className="d-flex flex-wrap gap-2 align-items-center">
                                <button
                                    className="btn btn-sm btn-success"
                                    type="button"
                                    onClick={() => setShowCreateVariant(!showCreateVariant)}
                                >
                                    <i className="fas fa-plus me-1" />Create Variant from Images
                                </button>
                            </div>

                            {showCreateVariant && (
                                <div className="mt-2 p-2 border rounded bg-white">
                                    <div className="mb-2">
                                        <label className="form-label small fw-bold mb-1">Variant Name</label>
                                        <input
                                            className="form-control form-control-sm"
                                            placeholder={`${product.name || 'Product'} - Variant`}
                                            value={newVariantName}
                                            onChange={e => setNewVariantName(e.target.value)}
                                        />
                                    </div>
                                    <div className="d-flex flex-wrap gap-2">
                                        <button
                                            className="btn btn-sm btn-success"
                                            type="button"
                                            disabled={!newVariantName.trim() || loading}
                                            onClick={createVariantFromImages}
                                            title="Create one variant with all selected images"
                                        >
                                            <i className="fas fa-layer-group me-1" />
                                            Single Variant ({selectedParentImages.size} image{selectedParentImages.size > 1 ? 's' : ''})
                                        </button>
                                        {selectedParentImages.size > 1 && (
                                            <button
                                                className="btn btn-sm btn-outline-success"
                                                type="button"
                                                disabled={loading}
                                                onClick={createVariantPerImage}
                                                title="Create one variant per selected image"
                                            >
                                                <i className="fas fa-th me-1" />
                                                One Variant Per Image ({selectedParentImages.size})
                                            </button>
                                        )}
                                        <button
                                            className="btn btn-sm btn-outline-secondary"
                                            type="button"
                                            onClick={() => { setShowCreateVariant(false); setNewVariantName(''); }}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* =============== CREATE VARIANTS BY TERM TYPE =============== */}
            <div className="card mb-3">
                <div className="card-header d-flex justify-content-between align-items-center py-2">
                    <h6 className="mb-0"><i className="fas fa-plus-circle me-2" />Create Variants by Term Type</h6>
                    {selectedTermTypeId && creatableTerms.length > 0 && (
                        <button
                            className="btn btn-success btn-sm"
                            type="button"
                            onClick={handleBulkCreateVariantsByTerm}
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
                                                        onClick={() => handleCreateVariantByTerm(term)}
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
                                            <td colSpan="8" className="text-muted text-center py-3">No terms for this term type</td>
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

            <TermTypeTermDialog
                show={showTermTypeDialog}
                onClose={() => setShowTermTypeDialog(false)}
                onConfirm={handleTermTypeDialogConfirm}
                variantOnly={true}
            />

            {/* =============== SUMMARY =============== */}
            {variants.length > 0 && (
                <div className="card mb-3">
                    <div className="card-header py-2">
                        <h6 className="mb-0"><i className="fas fa-chart-bar me-2" />Gallery Summary</h6>
                    </div>
                    <div className="card-body p-0">
                        <table className="table table-sm table-hover mb-0">
                            <thead className="table-light">
                                <tr>
                                    <th>Product / Variant</th>
                                    <th className="text-center">Images</th>
                                    <th>Preview</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>
                                        <i className="fas fa-box me-1" />
                                        <strong>{product.name}</strong>
                                        <span className="badge bg-info ms-1">Parent</span>
                                    </td>
                                    <td className="text-center">
                                        <span className="badge bg-secondary">{parentGallery.length}</span>
                                    </td>
                                    <td>
                                        <div className="d-flex gap-1">
                                            {parentGallery.slice(0, 4).map(img => (
                                                <img
                                                    key={img.id}
                                                    src={StraipImageUrl(img)}
                                                    alt=""
                                                    style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4 }}
                                                />
                                            ))}
                                            {parentGallery.length > 4 && (
                                                <span className="badge bg-light text-dark border align-self-center">+{parentGallery.length - 4}</span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                                {variants.map(v => {
                                    const vGallery = v.gallery || [];
                                    return (
                                        <tr key={getEntryId(v)}>
                                            <td>
                                                <i className="fas fa-code-branch me-1 ms-3" />
                                                {v.name}
                                            </td>
                                            <td className="text-center">
                                                <span className={`badge ${vGallery.length > 0 ? 'bg-success' : 'bg-secondary'}`}>{vGallery.length}</span>
                                            </td>
                                            <td>
                                                <div className="d-flex gap-1">
                                                    {vGallery.slice(0, 4).map(img => (
                                                        <img
                                                            key={img.id}
                                                            src={StraipImageUrl(img)}
                                                            alt=""
                                                            style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4 }}
                                                        />
                                                    ))}
                                                    {vGallery.length > 4 && (
                                                        <span className="badge bg-light text-dark border align-self-center">+{vGallery.length - 4}</span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <StrapiMediaLibrary
                show={showMediaLibrary}
                onClose={() => setShowMediaLibrary(false)}
                onSelect={handleMediaLibrarySelect}
                multiple
                accept="image"
            />
        </div>
    );
}
