import React, { useState, useEffect, useRef, useCallback } from 'react';
import { authApi, StraipImageUrl, isImage } from '../lib/api';
import { saveProduct } from '../lib/pos/save';

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
    const [selectedVariantImages, setSelectedVariantImages] = useState({});

    // Action state
    const [targetVariantId, setTargetVariantId] = useState('');
    const [showCreateVariant, setShowCreateVariant] = useState(false);
    const [newVariantName, setNewVariantName] = useState('');
    const [variantMoveTargets, setVariantMoveTargets] = useState({});

    // Expanded variant panels
    const [expandedVariants, setExpandedVariants] = useState(new Set());

    // Upload
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef();

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
            const res = await authApi.get(`/products/${productId}`, {
                populate: {
                    gallery: true,
                    logo: true,
                    variants: { populate: { gallery: true, terms: true } }
                }
            });
            const prod = res.data || res;
            setProduct(prod);
            const loadedVariants = prod.variants || [];
            setVariants(loadedVariants);
            setSelectedParentImages(new Set());
            setSelectedVariantImages({});
            // Auto-expand all variants that have images
            setExpandedVariants(new Set(loadedVariants.filter(v => (v.gallery || []).length > 0).map(v => getEntryId(v))));
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

    function toggleVariantImage(variantDocId, imageId) {
        setSelectedVariantImages(prev => {
            const current = new Set(prev[variantDocId] || []);
            current.has(imageId) ? current.delete(imageId) : current.add(imageId);
            return { ...prev, [variantDocId]: current };
        });
    }

    function selectAllVariantImages(variantDocId, images) {
        setSelectedVariantImages(prev => {
            const current = new Set(prev[variantDocId] || []);
            if (current.size === images.length) {
                return { ...prev, [variantDocId]: new Set() };
            }
            return { ...prev, [variantDocId]: new Set(images.map(img => img.id)) };
        });
    }

    function toggleExpandVariant(variantDocId) {
        setExpandedVariants(prev => {
            const s = new Set(prev);
            s.has(variantDocId) ? s.delete(variantDocId) : s.add(variantDocId);
            return s;
        });
    }

    // --- Upload ---

    async function handleUpload(e) {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        setUploading(true);
        try {
            await authApi.uploadFile(
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

            await authApi.put(`/products/${getEntryId(product)}`, {
                data: { gallery: remainingParentGallery.map(g => g.id) }
            });
            await authApi.put(`/products/${variantDocId}`, {
                data: { gallery: newVariantGallery }
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

            await authApi.put(`/products/${variantDocId}`, {
                data: { gallery: newVariantGallery }
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

    // --- Move images from variant → parent ---

    async function moveToParent(variantDocId) {
        const selected = selectedVariantImages[variantDocId];
        if (!selected || selected.size === 0) return setError('Select images first');
        const variant = variants.find(v => getEntryId(v) === variantDocId);
        if (!variant) return setError('Variant not found');

        setLoading(true);
        try {
            const imagesToMove = Array.from(selected);
            const variantGallery = variant.gallery || [];
            const remainingVariantGallery = variantGallery.filter(img => !selected.has(img.id));
            const existingParentIds = new Set(parentGallery.map(g => g.id));
            const newParentIds = imagesToMove.filter(id => !existingParentIds.has(id));
            const newParentGallery = [...parentGallery.map(g => g.id), ...newParentIds];

            await authApi.put(`/products/${variantDocId}`, {
                data: { gallery: remainingVariantGallery.map(g => g.id) }
            });
            await authApi.put(`/products/${getEntryId(product)}`, {
                data: { gallery: newParentGallery }
            });

            await loadData();
            if (onUpdate) onUpdate();
            setSuccess(`Moved ${imagesToMove.length} image(s) back to parent`);
        } catch (err) {
            console.error('Failed to move images to parent', err);
            setError('Failed to move images to parent');
        } finally {
            setLoading(false);
        }
    }

    // --- Copy images from variant → parent (variant keeps them) ---

    async function copyToParent(variantDocId) {
        const selected = selectedVariantImages[variantDocId];
        if (!selected || selected.size === 0) return setError('Select images first');
        const variant = variants.find(v => getEntryId(v) === variantDocId);
        if (!variant) return setError('Variant not found');

        setLoading(true);
        try {
            const imagesToCopy = Array.from(selected);
            const existingParentIds = new Set(parentGallery.map(g => g.id));
            const newParentIds = imagesToCopy.filter(id => !existingParentIds.has(id));
            const newParentGallery = [...parentGallery.map(g => g.id), ...newParentIds];

            await authApi.put(`/products/${getEntryId(product)}`, {
                data: { gallery: newParentGallery }
            });

            await loadData();
            if (onUpdate) onUpdate();
            setSuccess(`Copied ${newParentIds.length} image(s) to parent from "${variant.name}"`);
        } catch (err) {
            console.error('Failed to copy images to parent', err);
            setError('Failed to copy images to parent');
        } finally {
            setLoading(false);
        }
    }

    // --- Move images between variants ---

    async function moveBetweenVariants(sourceVariantDocId, targetVariantDocId) {
        const selected = selectedVariantImages[sourceVariantDocId];
        if (!selected || selected.size === 0) return setError('Select images first');
        if (!targetVariantDocId) return setError('Choose a target variant');
        const source = variants.find(v => getEntryId(v) === sourceVariantDocId);
        const target = variants.find(v => getEntryId(v) === targetVariantDocId);
        if (!source || !target) return setError('Variant not found');

        setLoading(true);
        try {
            const imagesToMove = Array.from(selected);
            const sourceGallery = source.gallery || [];
            const remainingSourceGallery = sourceGallery.filter(img => !selected.has(img.id));
            const targetGallery = target.gallery || [];
            const existingTargetIds = new Set(targetGallery.map(g => g.id));
            const newIds = imagesToMove.filter(id => !existingTargetIds.has(id));
            const newTargetGallery = [...targetGallery.map(g => g.id), ...newIds];

            await authApi.put(`/products/${sourceVariantDocId}`, {
                data: { gallery: remainingSourceGallery.map(g => g.id) }
            });
            await authApi.put(`/products/${targetVariantDocId}`, {
                data: { gallery: newTargetGallery }
            });

            await loadData();
            if (onUpdate) onUpdate();
            setVariantMoveTargets(prev => ({ ...prev, [sourceVariantDocId]: '' }));
            setSuccess(`Moved ${imagesToMove.length} image(s) from "${source.name}" to "${target.name}"`);
        } catch (err) {
            console.error('Failed to move images between variants', err);
            setError('Failed to move images');
        } finally {
            setLoading(false);
        }
    }

    // --- Copy images between variants (source keeps them) ---

    async function copyBetweenVariants(sourceVariantDocId, targetVariantDocId) {
        const selected = selectedVariantImages[sourceVariantDocId];
        if (!selected || selected.size === 0) return setError('Select images first');
        if (!targetVariantDocId) return setError('Choose a target variant');
        const source = variants.find(v => getEntryId(v) === sourceVariantDocId);
        const target = variants.find(v => getEntryId(v) === targetVariantDocId);
        if (!source || !target) return setError('Variant not found');

        setLoading(true);
        try {
            const imagesToCopy = Array.from(selected);
            const targetGallery = target.gallery || [];
            const existingTargetIds = new Set(targetGallery.map(g => g.id));
            const newIds = imagesToCopy.filter(id => !existingTargetIds.has(id));
            const newTargetGallery = [...targetGallery.map(g => g.id), ...newIds];

            await authApi.put(`/products/${targetVariantDocId}`, {
                data: { gallery: newTargetGallery }
            });

            await loadData();
            if (onUpdate) onUpdate();
            setVariantMoveTargets(prev => ({ ...prev, [sourceVariantDocId]: '' }));
            setSuccess(`Copied ${newIds.length} image(s) from "${source.name}" to "${target.name}"`);
        } catch (err) {
            console.error('Failed to copy images between variants', err);
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
            const remainingParentGallery = parentGallery.filter(img => !selectedParentImages.has(img.id));

            const payload = {
                name: newVariantName.trim(),
                sku: product.sku || '',
                barcode: product.barcode || '',
                selling_price: product.selling_price ?? 0,
                offer_price: product.offer_price ?? 0,
                is_active: product.is_active ?? true,
                parent: parentDocId,
                is_variant: true,
                gallery: imagesToAssign,
            };

            await saveProduct('new', payload);

            // Remove assigned images from parent
            await authApi.put(`/products/${parentDocId}`, {
                data: { gallery: remainingParentGallery.map(g => g.id) }
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

            for (let i = 0; i < selectedImages.length; i++) {
                const img = selectedImages[i];
                const variantName = selectedImages.length > 1
                    ? `${baseName} - ${i + 1}`
                    : baseName;
                const payload = {
                    name: variantName,
                    sku: product.sku || '',
                    barcode: product.barcode || '',
                    selling_price: product.selling_price ?? 0,
                    offer_price: product.offer_price ?? 0,
                    is_active: product.is_active ?? true,
                    parent: parentDocId,
                    is_variant: true,
                    gallery: [img.id],
                };
                await saveProduct('new', payload);
                created++;
            }

            // Remove assigned images from parent
            const remainingParentGallery = parentGallery.filter(img => !selectedParentImages.has(img.id));
            await authApi.put(`/products/${parentDocId}`, {
                data: { gallery: remainingParentGallery.map(g => g.id) }
            });

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

            {/* =============== VARIANT GALLERIES =============== */}
            {variants.length > 0 && (
                <div className="card mb-3">
                    <div className="card-header py-2">
                        <h6 className="mb-0">
                            <i className="fas fa-layer-group me-2" />
                            Variant Galleries ({variants.length} variant{variants.length > 1 ? 's' : ''})
                        </h6>
                    </div>
                    <div className="card-body p-2">
                        {variants.map(variant => {
                            const vId = getEntryId(variant);
                            const vGallery = variant.gallery || [];
                            const vSelected = selectedVariantImages[vId] || new Set();
                            const hasSelected = vSelected.size > 0;
                            const isExpanded = expandedVariants.has(vId);
                            const termNames = (variant.terms || []).map(t => t.name).join(', ');
                            const moveTarget = variantMoveTargets[vId] || '';

                            return (
                                <div key={vId} className="card mb-2">
                                    <div
                                        className="card-header py-2 d-flex justify-content-between align-items-center"
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => toggleExpandVariant(vId)}
                                    >
                                        <span className="fw-bold small">
                                            <i className={`fas fa-chevron-${isExpanded ? 'down' : 'right'} me-2`} />
                                            {variant.name}
                                            <span className="badge bg-secondary ms-2">{vGallery.length} image(s)</span>
                                            {termNames && (
                                                <span className="badge bg-light text-dark border ms-1">{termNames}</span>
                                            )}
                                            {hasSelected && (
                                                <span className="badge bg-primary ms-1">{vSelected.size} selected</span>
                                            )}
                                        </span>
                                    </div>

                                    {isExpanded && (
                                        <div className="card-body py-2">
                                            {vGallery.length === 0 ? (
                                                <div className="text-muted text-center py-2 small">No images assigned to this variant</div>
                                            ) : (
                                                <>
                                                    <div className="d-flex justify-content-end mb-2">
                                                        <button
                                                            className="btn btn-sm btn-outline-secondary"
                                                            type="button"
                                                            onClick={(e) => { e.stopPropagation(); selectAllVariantImages(vId, vGallery); }}
                                                        >
                                                            {vSelected.size === vGallery.length ? 'Deselect All' : 'Select All'}
                                                        </button>
                                                    </div>
                                                    <div className="d-flex flex-wrap gap-2">
                                                        {vGallery.map(img =>
                                                            renderImageThumbnail(
                                                                img,
                                                                vSelected.has(img.id),
                                                                () => toggleVariantImage(vId, img.id)
                                                            )
                                                        )}
                                                    </div>
                                                </>
                                            )}

                                            {/* Variant action bar */}
                                            {hasSelected && (
                                                <div className="mt-2 p-2 bg-light rounded border d-flex flex-wrap gap-2 align-items-center">
                                                    <span className="small fw-bold">{vSelected.size} selected:</span>

                                                    <button
                                                        className="btn btn-sm btn-outline-primary"
                                                        type="button"
                                                        disabled={loading}
                                                        onClick={() => moveToParent(vId)}
                                                        title="Move selected images back to parent (removes from variant)"
                                                    >
                                                        <i className="fas fa-arrow-up me-1" />Move to Parent
                                                    </button>
                                                    <button
                                                        className="btn btn-sm btn-outline-secondary"
                                                        type="button"
                                                        disabled={loading}
                                                        onClick={() => copyToParent(vId)}
                                                        title="Copy selected images to parent (keeps in variant)"
                                                    >
                                                        <i className="fas fa-copy me-1" />Copy to Parent
                                                    </button>

                                                    {variants.length > 1 && (
                                                        <>
                                                            <span className="mx-1 text-muted">|</span>
                                                            <select
                                                                className="form-select form-select-sm"
                                                                style={{ maxWidth: 200 }}
                                                                value={moveTarget}
                                                                onChange={e => setVariantMoveTargets(prev => ({ ...prev, [vId]: e.target.value }))}
                                                                onClick={e => e.stopPropagation()}
                                                            >
                                                                <option value="">Choose variant...</option>
                                                                {variants.filter(v => getEntryId(v) !== vId).map(v => (
                                                                    <option key={getEntryId(v)} value={getEntryId(v)}>
                                                                        {v.name} ({(v.gallery || []).length} imgs)
                                                                    </option>
                                                                ))}
                                                            </select>
                                                            <button
                                                                className="btn btn-sm btn-primary"
                                                                type="button"
                                                                disabled={!moveTarget || loading}
                                                                onClick={() => moveBetweenVariants(vId, moveTarget)}
                                                                title="Move to variant (removes from this variant)"
                                                            >
                                                                <i className="fas fa-exchange-alt me-1" />Move
                                                            </button>
                                                            <button
                                                                className="btn btn-sm btn-outline-primary"
                                                                type="button"
                                                                disabled={!moveTarget || loading}
                                                                onClick={() => copyBetweenVariants(vId, moveTarget)}
                                                                title="Copy to variant (keeps in this variant)"
                                                            >
                                                                <i className="fas fa-copy me-1" />Copy
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

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
        </div>
    );
}
