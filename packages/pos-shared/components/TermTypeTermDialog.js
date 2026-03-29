import React, { useState, useEffect, useRef, useCallback } from 'react';
import { authApi } from '../lib/api';

function getEntryId(entry) {
    return entry?.documentId || entry?.id;
}

/**
 * TermTypeTermDialog – modal dialog for selecting / creating a term type
 * and selecting / creating multiple terms within it.
 *
 * Props:
 *   show            - boolean – controls visibility
 *   onClose         - () => void
 *   onConfirm       - ({ termType, selectedTerms }) => void – called with chosen term type & terms
 *   variantOnly     - boolean – if true only load term types with is_variant:true (default true)
 */
export default function TermTypeTermDialog({
    show = false,
    onClose,
    onConfirm,
    variantOnly = true,
}) {
    const [termTypes, setTermTypes] = useState([]);
    const [selectedTermTypeId, setSelectedTermTypeId] = useState('');
    const [terms, setTerms] = useState([]);
    const [selectedTermIds, setSelectedTermIds] = useState(new Set());
    const [loading, setLoading] = useState(false);

    // Create term type form
    const [showCreateTermType, setShowCreateTermType] = useState(false);
    const [newTermTypeName, setNewTermTypeName] = useState('');
    const [newTermTypeIsVariant, setNewTermTypeIsVariant] = useState(true);
    const [creatingTermType, setCreatingTermType] = useState(false);

    // Create terms form
    const [newTermName, setNewTermName] = useState('');
    const [creatingTerm, setCreatingTerm] = useState(false);
    const [bulkTermNames, setBulkTermNames] = useState('');
    const [showBulkAdd, setShowBulkAdd] = useState(false);
    const [creatingBulk, setCreatingBulk] = useState(false);

    const newTermInputRef = useRef(null);

    const loadTermTypes = useCallback(async () => {
        if (!show) return;
        setLoading(true);
        try {
            const params = {
                populate: { terms: true },
                pagination: { page: 1, pageSize: 500 },
                sort: ['name:asc'],
            };
            if (variantOnly) {
                params.filters = { is_variant: true };
            }
            const res = await authApi.fetch('/term-types', params);
            const types = res?.data ?? res;
            setTermTypes(types || []);
        } catch (err) {
            console.error('TermTypeTermDialog: failed to load term types', err);
        } finally {
            setLoading(false);
        }
    }, [show, variantOnly]);

    useEffect(() => {
        if (show) {
            loadTermTypes();
        }
    }, [show, loadTermTypes]);

    // When selected term type changes, update terms list
    useEffect(() => {
        const tt = termTypes.find(t => getEntryId(t) === selectedTermTypeId);
        setTerms(tt?.terms || []);
    }, [selectedTermTypeId, termTypes]);

    // Reset when dialog opens
    useEffect(() => {
        if (show) {
            setSelectedTermTypeId('');
            setSelectedTermIds(new Set());
            setShowCreateTermType(false);
            setNewTermTypeName('');
            setNewTermName('');
            setBulkTermNames('');
            setShowBulkAdd(false);
        }
    }, [show]);

    function handleTermTypeSelect(id) {
        setSelectedTermTypeId(id);
        setSelectedTermIds(new Set());
    }

    function toggleTerm(termId) {
        setSelectedTermIds(prev => {
            const next = new Set(prev);
            if (next.has(termId)) next.delete(termId);
            else next.add(termId);
            return next;
        });
    }

    function selectAllTerms() {
        if (selectedTermIds.size === terms.length) {
            setSelectedTermIds(new Set());
        } else {
            setSelectedTermIds(new Set(terms.map(t => getEntryId(t))));
        }
    }

    async function handleCreateTermType() {
        const name = newTermTypeName.trim();
        if (!name) return;
        setCreatingTermType(true);
        try {
            const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
            const payload = {
                name,
                slug,
                is_variant: newTermTypeIsVariant,
                is_public: true,
            };
            const res = await authApi.post('/term-types', { data: payload });
            const created = res?.data ?? res;
            const createdId = getEntryId(created);
            await loadTermTypes();
            setSelectedTermTypeId(createdId);
            setShowCreateTermType(false);
            setNewTermTypeName('');
        } catch (err) {
            console.error('Failed to create term type', err);
            alert('Failed to create term type');
        } finally {
            setCreatingTermType(false);
        }
    }

    async function handleCreateTerm() {
        const name = newTermName.trim();
        if (!name || !selectedTermTypeId) return;
        setCreatingTerm(true);
        try {
            const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
            const payload = {
                name,
                slug,
                term_types: { connect: [selectedTermTypeId] },
            };
            const res = await authApi.post('/terms', { data: payload });
            const createdTerm = res?.data ?? res;
            const createdId = getEntryId(createdTerm);
            setNewTermName('');
            await loadTermTypes();
            // Auto-select the newly created term
            if (createdId) {
                setSelectedTermIds(prev => new Set([...prev, createdId]));
            }
            // Focus back on input for quick adding
            if (newTermInputRef.current) newTermInputRef.current.focus();
        } catch (err) {
            console.error('Failed to create term', err);
            alert('Failed to create term');
        } finally {
            setCreatingTerm(false);
        }
    }

    async function handleBulkCreateTerms() {
        if (!selectedTermTypeId) return;
        const names = bulkTermNames
            .split('\n')
            .map(s => s.trim())
            .filter(Boolean);
        if (names.length === 0) return;
        setCreatingBulk(true);
        try {
            const createdIds = [];
            for (const name of names) {
                const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                const res = await authApi.post('/terms', {
                    data: {
                        name,
                        slug,
                        term_types: { connect: [selectedTermTypeId] },
                    },
                });
                const created = res?.data ?? res;
                const cid = getEntryId(created);
                if (cid) createdIds.push(cid);
            }
            setBulkTermNames('');
            setShowBulkAdd(false);
            await loadTermTypes();
            // Auto-select all newly created terms
            if (createdIds.length > 0) {
                setSelectedTermIds(prev => new Set([...prev, ...createdIds]));
            }
        } catch (err) {
            console.error('Failed to bulk create terms', err);
            alert('Failed to create some terms');
        } finally {
            setCreatingBulk(false);
        }
    }

    function handleConfirm() {
        const tt = termTypes.find(t => getEntryId(t) === selectedTermTypeId);
        if (!tt) return;
        const chosen = terms.filter(t => selectedTermIds.has(getEntryId(t)));
        if (chosen.length === 0) return;
        onConfirm({ termType: tt, selectedTerms: chosen });
    }

    if (!show) return null;

    const selectedTermType = termTypes.find(t => getEntryId(t) === selectedTermTypeId);
    const allSelected = terms.length > 0 && selectedTermIds.size === terms.length;

    return (
        <div className="modal d-block" tabIndex={-1} style={{ background: 'rgba(0,0,0,0.5)', zIndex: 9999 }}>
            <div className="modal-dialog modal-lg modal-dialog-scrollable">
                <div className="modal-content" style={{ minHeight: '60vh' }}>
                    <div className="modal-header py-2">
                        <h5 className="modal-title"><i className="fas fa-tags me-2" />Select Term Type &amp; Terms</h5>
                        <button type="button" className="btn-close" onClick={onClose} />
                    </div>

                    <div className="modal-body">
                        {/* ---- Term Type Section ---- */}
                        <div className="mb-3">
                            <div className="d-flex align-items-center justify-content-between mb-2">
                                <label className="form-label fw-bold mb-0">Term Type</label>
                                <button
                                    className="btn btn-sm btn-outline-success"
                                    type="button"
                                    onClick={() => setShowCreateTermType(v => !v)}
                                >
                                    <i className={`fas ${showCreateTermType ? 'fa-times' : 'fa-plus'} me-1`} />
                                    {showCreateTermType ? 'Cancel' : 'New Term Type'}
                                </button>
                            </div>

                            {showCreateTermType && (
                                <div className="card card-body bg-light mb-2 p-2">
                                    <div className="d-flex align-items-end gap-2">
                                        <div className="flex-grow-1">
                                            <label className="form-label small mb-1">Name</label>
                                            <input
                                                className="form-control form-control-sm"
                                                value={newTermTypeName}
                                                onChange={e => setNewTermTypeName(e.target.value)}
                                                placeholder="e.g. Size, Color, Material"
                                                onKeyDown={e => { if (e.key === 'Enter') handleCreateTermType(); }}
                                                autoFocus
                                            />
                                        </div>
                                        <div className="form-check mb-1">
                                            <input
                                                type="checkbox"
                                                className="form-check-input"
                                                id="newTTVariant"
                                                checked={newTermTypeIsVariant}
                                                onChange={e => setNewTermTypeIsVariant(e.target.checked)}
                                            />
                                            <label className="form-check-label small" htmlFor="newTTVariant">Variant</label>
                                        </div>
                                        <button
                                            className="btn btn-sm btn-success"
                                            type="button"
                                            onClick={handleCreateTermType}
                                            disabled={creatingTermType || !newTermTypeName.trim()}
                                        >
                                            {creatingTermType ? <i className="fas fa-spinner fa-spin" /> : 'Create'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="d-flex flex-wrap gap-2">
                                {loading && termTypes.length === 0 && (
                                    <span className="text-muted small"><i className="fas fa-spinner fa-spin me-1" />Loading...</span>
                                )}
                                {termTypes.map(tt => {
                                    const id = getEntryId(tt);
                                    const isActive = id === selectedTermTypeId;
                                    return (
                                        <button
                                            key={id}
                                            type="button"
                                            className={`btn btn-sm ${isActive ? 'btn-primary' : 'btn-outline-secondary'}`}
                                            onClick={() => handleTermTypeSelect(id)}
                                        >
                                            {tt.name}
                                            <span className="badge bg-light text-dark ms-1">{(tt.terms || []).length}</span>
                                        </button>
                                    );
                                })}
                                {!loading && termTypes.length === 0 && (
                                    <span className="text-muted small">No term types found. Create one above.</span>
                                )}
                            </div>
                        </div>

                        {/* ---- Terms Section ---- */}
                        {selectedTermTypeId && (
                            <div>
                                <div className="d-flex align-items-center justify-content-between mb-2">
                                    <label className="form-label fw-bold mb-0">
                                        Terms for <em>{selectedTermType?.name}</em>
                                        {selectedTermIds.size > 0 && (
                                            <span className="badge bg-primary ms-2">{selectedTermIds.size} selected</span>
                                        )}
                                    </label>
                                    <div className="d-flex gap-1">
                                        <button
                                            className="btn btn-sm btn-outline-secondary"
                                            type="button"
                                            onClick={selectAllTerms}
                                        >
                                            {allSelected ? 'Unselect All' : 'Select All'}
                                        </button>
                                        <button
                                            className="btn btn-sm btn-outline-info"
                                            type="button"
                                            onClick={() => setShowBulkAdd(v => !v)}
                                        >
                                            <i className={`fas ${showBulkAdd ? 'fa-times' : 'fa-list'} me-1`} />
                                            {showBulkAdd ? 'Cancel' : 'Bulk Add'}
                                        </button>
                                    </div>
                                </div>

                                {/* Quick-add single term */}
                                <div className="input-group input-group-sm mb-2">
                                    <input
                                        ref={newTermInputRef}
                                        className="form-control"
                                        placeholder="New term name — press Enter to add"
                                        value={newTermName}
                                        onChange={e => setNewTermName(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateTerm(); } }}
                                        disabled={creatingTerm}
                                    />
                                    <button
                                        className="btn btn-outline-success"
                                        type="button"
                                        onClick={handleCreateTerm}
                                        disabled={creatingTerm || !newTermName.trim()}
                                    >
                                        {creatingTerm ? <i className="fas fa-spinner fa-spin" /> : <><i className="fas fa-plus me-1" />Add</>}
                                    </button>
                                </div>

                                {/* Bulk add terms */}
                                {showBulkAdd && (
                                    <div className="card card-body bg-light mb-2 p-2">
                                        <label className="form-label small mb-1">One term per line:</label>
                                        <textarea
                                            className="form-control form-control-sm mb-2"
                                            rows={4}
                                            value={bulkTermNames}
                                            onChange={e => setBulkTermNames(e.target.value)}
                                            placeholder={"Small\nMedium\nLarge\nXL"}
                                            autoFocus
                                        />
                                        <div className="d-flex justify-content-end">
                                            <button
                                                className="btn btn-sm btn-success"
                                                type="button"
                                                onClick={handleBulkCreateTerms}
                                                disabled={creatingBulk || !bulkTermNames.trim()}
                                            >
                                                {creatingBulk
                                                    ? <><i className="fas fa-spinner fa-spin me-1" />Creating...</>
                                                    : <>Create {bulkTermNames.split('\n').filter(s => s.trim()).length} term(s)</>}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Terms list */}
                                <div className="d-flex flex-wrap gap-2">
                                    {terms.map(term => {
                                        const id = getEntryId(term);
                                        const checked = selectedTermIds.has(id);
                                        return (
                                            <button
                                                key={id}
                                                type="button"
                                                className={`btn btn-sm ${checked ? 'btn-success' : 'btn-outline-secondary'}`}
                                                onClick={() => toggleTerm(id)}
                                            >
                                                {checked && <i className="fas fa-check me-1" />}
                                                {term.name}
                                            </button>
                                        );
                                    })}
                                    {terms.length === 0 && (
                                        <span className="text-muted small py-2">No terms yet. Add some above.</span>
                                    )}
                                </div>
                            </div>
                        )}

                        {!selectedTermTypeId && !showCreateTermType && (
                            <div className="text-muted text-center py-4">
                                <i className="fas fa-info-circle me-2" />Select a term type above, or create a new one
                            </div>
                        )}
                    </div>

                    <div className="modal-footer py-2">
                        <button className="btn btn-secondary btn-sm" type="button" onClick={onClose}>Cancel</button>
                        <button
                            className="btn btn-primary btn-sm"
                            type="button"
                            onClick={handleConfirm}
                            disabled={!selectedTermTypeId || selectedTermIds.size === 0}
                        >
                            <i className="fas fa-check me-1" />
                            Confirm {selectedTermIds.size > 0 ? `(${selectedTermIds.size} term${selectedTermIds.size > 1 ? 's' : ''})` : ''}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
