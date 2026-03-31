import React, { useState, useEffect, useCallback } from 'react';
import { authApi } from '../lib/api';
import TermTypeTermDialog from './TermTypeTermDialog';

function getEntryId(entry) {
    return entry?.documentId || entry?.id;
}

/**
 * ProductVariantManager – Manages the term-type / term relationship
 * for a parent product and its variants.
 *
 * Shows:
 *  - Parent product term overview (which variant term-types apply)
 *  - Each variant with its attached terms, with quick add/remove
 *  - A display-mode toggle (show variant by name vs. by term labels)
 *
 * Props:
 *   productId   – documentId of the parent product
 *   onUpdate    – optional callback after any mutation
 */
export default function ProductVariantManager({ productId, onUpdate }) {
    const [product, setProduct] = useState(null);
    const [variants, setVariants] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // All variant term-types (is_variant: true)
    const [termTypes, setTermTypes] = useState([]);

    // Term dialog state
    const [showTermDialog, setShowTermDialog] = useState(false);
    const [termDialogMode, setTermDialogMode] = useState(null); // 'parent' | variantDocId


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
                    terms: { populate: { term_types: true } },
                    variants: { populate: { terms: { populate: { term_types: true } }, logo: true } },
                },
            });
            const prod = res.data || res;
            setProduct(prod);
            setVariants(prod.variants || []);
        } catch (err) {
            console.error('ProductVariantManager: Failed to load', err);
            setError('Failed to load product data');
        } finally {
            setLoading(false);
        }
    }, [productId]);

    const loadTermTypes = useCallback(async () => {
        try {
            const res = await authApi.fetch('/term-types', {
                filters: { is_variant: true },
                populate: { terms: true },
                pagination: { page: 1, pageSize: 500 },
                sort: ['name:asc'],
            });
            setTermTypes((res?.data ?? res) || []);
        } catch (err) {
            console.error('Failed to load term types', err);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);
    useEffect(() => { loadTermTypes(); }, [loadTermTypes]);

    // --- Helpers ---

    // Group terms by their term-type
    function groupTermsByType(terms) {
        const groups = {};
        for (const term of (terms || [])) {
            for (const tt of (term.term_types || [])) {
                const ttId = getEntryId(tt);
                if (!groups[ttId]) {
                    groups[ttId] = { termType: tt, terms: [] };
                }
                groups[ttId].terms.push(term);
            }
        }
        return Object.values(groups);
    }

    // Get the variant term-type IDs used across all variants
    function getUsedTermTypeIds() {
        const ids = new Set();
        for (const v of variants) {
            for (const term of (v.terms || [])) {
                for (const tt of (term.term_types || [])) {
                    if (tt.is_variant) ids.add(getEntryId(tt));
                }
            }
        }
        return ids;
    }

    // --- Actions ---

    async function handleAttachTermsToProduct(selectedTerms) {
        if (!product || selectedTerms.length === 0) return;
        setLoading(true);
        try {
            const existingTermIds = (product.terms || []).map(t => getEntryId(t));
            const newIds = selectedTerms.map(t => getEntryId(t)).filter(id => !existingTermIds.includes(id));
            if (newIds.length > 0) {
                await authApi.put(`/products/${getEntryId(product)}`, {
                    data: { terms: { connect: [...existingTermIds, ...newIds] } },
                });
            }
            await loadData();
            if (onUpdate) onUpdate();
            setSuccess(`Attached ${newIds.length} term(s) to product`);
        } catch (err) {
            console.error('Failed to attach terms to product', err);
            setError('Failed to attach terms');
        } finally {
            setLoading(false);
        }
    }

    async function handleRemoveTermFromProduct(termDocId) {
        if (!product) return;
        setLoading(true);
        try {
            await authApi.put(`/products/${getEntryId(product)}`, {
                data: { terms: { disconnect: [termDocId] } },
            });
            await loadData();
            if (onUpdate) onUpdate();
        } catch (err) {
            console.error('Failed to remove term from product', err);
            setError('Failed to remove term');
        } finally {
            setLoading(false);
        }
    }

    async function handleAttachTermsToVariant(variantDocId, selectedTerms) {
        if (!variantDocId || selectedTerms.length === 0) return;
        const variant = variants.find(v => getEntryId(v) === variantDocId);
        if (!variant) return;
        setLoading(true);
        try {
            const existingTermIds = (variant.terms || []).map(t => getEntryId(t));
            const newIds = selectedTerms.map(t => getEntryId(t)).filter(id => !existingTermIds.includes(id));
            if (newIds.length > 0) {
                await authApi.put(`/products/${variantDocId}`, {
                    data: { terms: { connect: [...existingTermIds, ...newIds] } },
                });
            }
            await loadData();
            if (onUpdate) onUpdate();
            setSuccess(`Attached ${newIds.length} term(s) to "${variant.name}"`);
        } catch (err) {
            console.error('Failed to attach terms to variant', err);
            setError('Failed to attach terms');
        } finally {
            setLoading(false);
        }
    }

    async function handleRemoveTermFromVariant(variantDocId, termDocId) {
        setLoading(true);
        try {
            await authApi.put(`/products/${variantDocId}`, {
                data: { terms: { disconnect: [termDocId] } },
            });
            await loadData();
            if (onUpdate) onUpdate();
        } catch (err) {
            console.error('Failed to remove term from variant', err);
            setError('Failed to remove term');
        } finally {
            setLoading(false);
        }
    }

    // Quick-attach: open the term-type dialog targeting a specific product or variant
    function openTermDialog(target) {
        setTermDialogMode(target); // 'parent' | variantDocId
        setShowTermDialog(true);
    }

    function handleTermDialogConfirm({ termType, selectedTerms }) {
        setShowTermDialog(false);
        if (!termDialogMode) return;
        if (termDialogMode === 'parent') {
            handleAttachTermsToProduct(selectedTerms);
        } else {
            handleAttachTermsToVariant(termDialogMode, selectedTerms);
        }
        loadTermTypes();
    }

    // --- Quick term picker (inline, for a variant row) ---

    function TermBadges({ terms, onRemove, disabled }) {
        const grouped = groupTermsByType(terms);
        if (grouped.length === 0) {
            return <span className="text-muted small">No terms</span>;
        }
        return (
            <div className="d-flex flex-wrap gap-1">
                {grouped.map(g => (
                    <React.Fragment key={getEntryId(g.termType)}>
                        {g.terms.map(t => (
                            <span key={getEntryId(t)} className="badge bg-light text-dark border d-inline-flex align-items-center gap-1">
                                <small className="text-muted">{g.termType.name}:</small>
                                {t.name}
                                {onRemove && !disabled && (
                                    <button
                                        type="button"
                                        className="btn-close btn-close-sm ms-1"
                                        style={{ fontSize: '0.5rem' }}
                                        onClick={(e) => { e.stopPropagation(); onRemove(getEntryId(t)); }}
                                    />
                                )}
                            </span>
                        ))}
                    </React.Fragment>
                ))}
            </div>
        );
    }

    // --- Render ---

    if (!product) {
        return loading
            ? <div className="text-center py-4"><i className="fas fa-spinner fa-spin me-2" />Loading...</div>
            : null;
    }

    const parentTermGroups = groupTermsByType(product.terms || []);
    const usedTermTypeIds = getUsedTermTypeIds();

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

            {/* =============== PARENT PRODUCT OVERVIEW =============== */}
            <div className="card mb-3">
                <div className="card-header d-flex justify-content-between align-items-center py-2">
                    <h6 className="mb-0">
                        <i className="fas fa-box me-2" />
                        {product.name}
                        <span className="badge bg-info ms-2">Parent</span>
                        <span className="badge bg-secondary ms-1">{variants.length} variant(s)</span>
                    </h6>
                </div>
                <div className="card-body">
                    {/* Variant Term Types used */}
                    <div className="mb-2">
                        <label className="form-label small fw-bold mb-1">
                            <i className="fas fa-palette me-1" />Variant Term Types
                        </label>
                        <div className="d-flex flex-wrap gap-2 align-items-center">
                            {termTypes.filter(tt => usedTermTypeIds.has(getEntryId(tt))).map(tt => (
                                <span key={getEntryId(tt)} className="badge bg-primary">
                                    {tt.name}
                                    <span className="badge bg-light text-dark ms-1">{(tt.terms || []).length}</span>
                                </span>
                            ))}
                            {usedTermTypeIds.size === 0 && (
                                <span className="text-muted small">No variant term types in use yet</span>
                            )}
                        </div>
                    </div>

                    {/* Parent product terms */}
                    <div>
                        <div className="d-flex align-items-center justify-content-between mb-1">
                            <label className="form-label small fw-bold mb-0">
                                <i className="fas fa-tags me-1" />Product Terms
                            </label>
                            <button
                                className="btn btn-sm btn-outline-success"
                                type="button"
                                onClick={() => openTermDialog('parent')}
                                disabled={loading}
                            >
                                <i className="fas fa-plus me-1" />Attach Terms
                            </button>
                        </div>
                        {parentTermGroups.length > 0 ? (
                            <div className="d-flex flex-wrap gap-1">
                                {parentTermGroups.map(g => (
                                    <React.Fragment key={getEntryId(g.termType)}>
                                        {g.terms.map(t => (
                                            <span key={getEntryId(t)} className="badge bg-light text-dark border d-inline-flex align-items-center gap-1">
                                                <small className="text-muted">{g.termType.name}:</small>
                                                {t.name}
                                                <button
                                                    type="button"
                                                    className="btn-close btn-close-sm ms-1"
                                                    style={{ fontSize: '0.5rem' }}
                                                    onClick={() => handleRemoveTermFromProduct(getEntryId(t))}
                                                    disabled={loading}
                                                />
                                            </span>
                                        ))}
                                    </React.Fragment>
                                ))}
                            </div>
                        ) : (
                            <span className="text-muted small">No terms attached to parent product</span>
                        )}
                    </div>
                </div>
            </div>

            {/* =============== VARIANTS =============== */}
            {variants.length > 0 && (
                <div className="card mb-3">
                    <div className="card-header py-2">
                        <h6 className="mb-0">
                            <i className="fas fa-layer-group me-2" />Variants &amp; Terms
                        </h6>
                    </div>
                    <div className="card-body p-0">
                        <div className="table-responsive">
                            <table className="table table-sm table-hover align-middle mb-0">
                                <thead className="table-light">
                                    <tr>
                                        <th style={{ width: '30%' }}>Variant</th>
                                        <th>Terms</th>
                                        <th style={{ width: '100px' }} className="text-end">Price</th>
                                        <th style={{ width: '80px' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {variants.map(v => {
                                        const vId = getEntryId(v);
                                        const vTerms = v.terms || [];
                                        return (
                                            <tr key={vId}>
                                                <td>
                                                    <strong>{v.name}</strong>
                                                    {v.is_active === false && (
                                                        <span className="badge bg-warning text-dark ms-1">Inactive</span>
                                                    )}
                                                </td>
                                                <td>
                                                    <TermBadges
                                                        terms={vTerms}
                                                        onRemove={(termDocId) => handleRemoveTermFromVariant(vId, termDocId)}
                                                        disabled={loading}
                                                    />
                                                </td>
                                                <td className="text-end">
                                                    <span className="small">{v.selling_price ?? '—'}</span>
                                                    {v.offer_price != null && v.offer_price !== '' && v.offer_price > 0 && (
                                                        <span className="small text-success ms-1">({v.offer_price})</span>
                                                    )}
                                                </td>
                                                <td>
                                                    <button
                                                        className="btn btn-sm btn-outline-primary w-100"
                                                        type="button"
                                                        onClick={() => openTermDialog(vId)}
                                                        disabled={loading}
                                                        title="Attach terms to this variant"
                                                    >
                                                        <i className="fas fa-plus me-1" />Terms
                                                    </button>
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

            {variants.length === 0 && (
                <div className="alert alert-info py-2">
                    <i className="fas fa-info-circle me-2" />
                    No variants yet. Create variants using the term-type section or gallery above.
                </div>
            )}

            <TermTypeTermDialog
                show={showTermDialog}
                onClose={() => setShowTermDialog(false)}
                onConfirm={handleTermDialogConfirm}
                variantOnly={true}
            />
        </div>
    );
}
