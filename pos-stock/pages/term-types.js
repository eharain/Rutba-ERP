import { useEffect, useMemo, useState, useRef } from "react";
import * as XLSX from 'xlsx';
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { authApi } from "@rutba/pos-shared/lib/api";

export default function TermTypesPage() {
    const [termTypes, setTermTypes] = useState([]);
    const [terms, setTerms] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedTermTypeId, setSelectedTermTypeId] = useState("");
    const [isEditingTermType, setIsEditingTermType] = useState(false);
    const [termTypeForm, setTermTypeForm] = useState({
        name: "",
        slug: "",
        is_variant: false,
        is_public: true
    });
    const [termForm, setTermForm] = useState({ name: "", slug: "" });
    const [termSearch, setTermSearch] = useState("");
    const [termSearchResults, setTermSearchResults] = useState([]);
    const [isTermSearchLoading, setIsTermSearchLoading] = useState(false);
    const [mergeSearch, setMergeSearch] = useState("");
    const [mergeSelection, setMergeSelection] = useState(new Set());
    const [isMergeOpen, setIsMergeOpen] = useState(false);

    // Bulk import state
    const fileInputRef = useRef(null);
    const [importRows, setImportRows] = useState([]);
    const [importFileName, setImportFileName] = useState('');
    const [importParsing, setImportParsing] = useState(false);
    const [importCreating, setImportCreating] = useState(false);
    const [importLog, setImportLog] = useState([]);

    useEffect(() => {
        loadData();
    }, []);

    function getEntryId(entry) {
        return entry?.documentId || entry?.id;
    }

    useEffect(() => {
        const searchValue = termSearch.trim();
        if (!searchValue) {
            setTermSearchResults([]);
            return;
        }

        let isActive = true;
        const timer = setTimeout(async () => {
            setIsTermSearchLoading(true);
            try {
                const res = await authApi.fetch("/terms", {
                    sort: ["name:asc"],
                    filters: { name: { $containsi: searchValue } }
                });
                const data = res?.data ?? res;
                if (isActive) {
                    setTermSearchResults(data || []);
                }
            } catch (error) {
                console.error("Failed to search terms", error);
                if (isActive) {
                    setTermSearchResults([]);
                }
            } finally {
                if (isActive) {
                    setIsTermSearchLoading(false);
                }
            }
        }, 300);

        return () => {
            isActive = false;
            clearTimeout(timer);
        };
    }, [termSearch]);

    function getEntryKey(entry) {
        const id = getEntryId(entry);
        return id ? String(id) : "";
    }

    async function loadData() {
        setLoading(true);
        try {
            const [termTypesRes, termsRes] = await Promise.all([
                authApi.fetch("/term-types", { sort: ["name:asc"], populate: { terms: true } }),
                authApi.fetch("/terms", { sort: ["name:asc"] })
            ]);
            const termTypesData = termTypesRes?.data ?? termTypesRes;
            const termsData = termsRes?.data ?? termsRes;
            setTermTypes(termTypesData || []);
            setTerms(termsData || []);

            const existing = termTypesData?.find((type) => getEntryId(type) === selectedTermTypeId);
            if (!existing) {
                setSelectedTermTypeId(getEntryId(termTypesData?.[0]) || "");
            }
            if (isEditingTermType && !existing) {
                setIsEditingTermType(false);
                setTermTypeForm({ name: "", slug: "", is_variant: false, is_public: true });
            }
        } catch (error) {
            console.error("Failed to load term types or terms", error);
        } finally {
            setLoading(false);
        }
    }

    async function handleMergeTermTypes() {
        if (!selectedTermTypeId) return alert("Select a target term type first");
        if (mergeSelection.size === 0) return alert("Select term types to merge");
        setLoading(true);
        try {
            const target = termTypes.find((type) => getEntryId(type) === selectedTermTypeId);
            const targetTermIds = new Set((target?.terms || []).map((term) => getEntryId(term)));
            const mergedTermIds = new Set(targetTermIds);

            mergeSelection.forEach((typeId) => {
                const source = termTypes.find((type) => getEntryId(type) === typeId);
                (source?.terms || []).forEach((term) => mergedTermIds.add(getEntryId(term)));
            });

            await authApi.put(`/term-types/${selectedTermTypeId}`, {
                data: { terms: { connect: Array.from(mergedTermIds) } }
            });

            await Promise.all(
                Array.from(mergeSelection).map((typeId) => authApi.del(`/term-types/${typeId}`))
            );

            setMergeSelection(new Set());
            setIsMergeOpen(false);
            await loadData();
        } catch (error) {
            console.error("Failed to merge term types", error);
            alert("Failed to merge term types");
        } finally {
            setLoading(false);
        }
    }

    function openMergeDialog() {
        if (!selectedTermTypeId) {
            alert("Select a target term type first");
            return;
        }
        setMergeSearch("");
        setMergeSelection(new Set());
        setIsMergeOpen(true);
    }

    function closeMergeDialog() {
        setIsMergeOpen(false);
        setMergeSearch("");
        setMergeSelection(new Set());
    }

    function handleTermTypeChange(e) {
        const { name, value, type, checked } = e.target;
        setTermTypeForm((prev) => ({
            ...prev,
            [name]: type === "checkbox" ? checked : value
        }));
    }

    function handleTermChange(e) {
        const { name, value } = e.target;
        setTermForm((prev) => ({ ...prev, [name]: value }));
    }

    function handleEditTermType() {
        if (!selectedTermTypeId) return alert("Select a term type first");
        const selected = termTypes.find((type) => getEntryId(type) === selectedTermTypeId);
        if (!selected) return;
        setTermTypeForm({
            name: selected.name || "",
            slug: selected.slug || "",
            is_variant: !!selected.is_variant,
            is_public: selected.is_public ?? true
        });
        setIsEditingTermType(true);
    }

    async function handleCreateTermType(e) {
        e.preventDefault();
        const slugValue = termTypeForm.slug?.trim();
        if (slugValue) {
            const slugConflict = termTypes.find((type) => {
                const id = getEntryId(type);
                return type.slug === slugValue && id !== selectedTermTypeId;
            });
            if (slugConflict) {
                alert("Slug must be unique. Please choose a different slug.");
                return;
            }
        }
        setLoading(true);
        try {
            const payload = {
                name: termTypeForm.name,
                slug: slugValue || undefined,
                is_variant: termTypeForm.is_variant,
                is_public: termTypeForm.is_public
            };
            if (isEditingTermType && selectedTermTypeId) {
                await authApi.put(`/term-types/${selectedTermTypeId}`, { data: payload });
            } else {
                const res = await authApi.post("/term-types", { data: payload });
                const created = res?.data ?? res;
                setSelectedTermTypeId(getEntryId(created));
            }
            setIsEditingTermType(false);
            setTermTypeForm({ name: "", slug: "", is_variant: false, is_public: true });
            await loadData();
        } catch (error) {
            console.error("Failed to create term type", error);
            alert("Failed to create term type");
        } finally {
            setLoading(false);
        }
    }

    async function handleCreateTerm(e) {
        e.preventDefault();
        if (!selectedTermTypeId) return alert("Select a term type first");
        setLoading(true);
        try {
            const payload = {
                name: termForm.name,
                slug: termForm.slug || undefined,
                term_types: { connect: [selectedTermTypeId] }
            };
            await authApi.post("/terms", { data: payload });
            setTermForm({ name: "", slug: "" });
            await loadData();
        } catch (error) {
            console.error("Failed to create term", error);
            alert("Failed to create term");
        } finally {
            setLoading(false);
        }
    }

    async function handleAddExistingTerm(termId) {
        if (!selectedTermTypeId) return alert("Select a term type first");
        if (!termId) return alert("Select a term to add");
        setLoading(true);
        try {
            await authApi.put(`/term-types/${selectedTermTypeId}`, {
                data: { terms: { connect: [termId] } }
            });
            await loadData();
        } catch (error) {
            console.error("Failed to add term", error);
            alert("Failed to add term");
        } finally {
            setLoading(false);
        }
    }

    async function handleRemoveTerm(termId) {
        if (!selectedTermTypeId) return;
        setLoading(true);
        try {
            await authApi.put(`/term-types/${selectedTermTypeId}`, {
                data: { terms: { disconnect: [termId] } }
            });
            await loadData();
        } catch (error) {
            console.error("Failed to remove term", error);
            alert("Failed to remove term");
        } finally {
            setLoading(false);
        }
    }

    function parseImportFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const wb = XLSX.read(e.target.result, { type: 'array' });
                    const ws = wb.Sheets[wb.SheetNames[0]];
                    const jsonRows = XLSX.utils.sheet_to_json(ws, { defval: '' });
                    if (!jsonRows || jsonRows.length === 0) return resolve([]);
                    const nameKeys = ['name', 'Name', 'NAME', 'term', 'Term', 'TERM', 'title', 'Title', 'TITLE'];
                    const slugKeys = ['slug', 'Slug', 'SLUG', 'code', 'Code', 'CODE'];
                    function findCol(row, keys) {
                        for (const k of keys) {
                            if (Object.prototype.hasOwnProperty.call(row, k) && row[k] !== '') return String(row[k]).trim();
                        }
                        return '';
                    }
                    const mapped = jsonRows.map((row, i) => {
                        const name = findCol(row, nameKeys);
                        const slug = findCol(row, slugKeys);
                        return { name, slug, _key: Date.now() + i, _selected: true, _status: '' };
                    }).filter(r => r.name);
                    resolve(mapped);
                } catch (err) { reject(err); }
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsArrayBuffer(file);
        });
    }

    async function handleImportFile(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        setImportParsing(true);
        setImportLog([]);
        try {
            const rows = await parseImportFile(file);
            if (rows.length === 0) {
                setImportLog([{ type: 'warning', text: 'No rows with a name column found in the file.' }]);
                setImportRows([]);
            } else {
                setImportRows(rows);
                setImportLog([{ type: 'info', text: `Parsed ${rows.length} term(s) from "${file.name}"` }]);
            }
            setImportFileName(file.name);
        } catch (err) {
            console.error('Import parse error', err);
            setImportLog([{ type: 'danger', text: 'Failed to parse file: ' + (err.message || 'Unknown error') }]);
            setImportRows([]);
        } finally {
            setImportParsing(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }

    function toggleImportRow(index) {
        setImportRows(prev => prev.map((r, i) => i === index ? { ...r, _selected: !r._selected } : r));
    }

    function toggleAllImportRows() {
        const allSelected = importRows.every(r => r._selected);
        setImportRows(prev => prev.map(r => ({ ...r, _selected: !allSelected })));
    }

    function updateImportRow(index, field, value) {
        setImportRows(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
    }

    function removeImportRow(index) {
        setImportRows(prev => prev.filter((_, i) => i !== index));
    }

    function clearImport() {
        setImportRows([]);
        setImportFileName('');
        setImportLog([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }

    async function handleBulkCreateTerms() {
        if (!selectedTermTypeId) return alert('Select a term type first');
        const selected = importRows.filter(r => r._selected && r.name.trim());
        if (selected.length === 0) return alert('No terms selected for import');
        if (!confirm(`Create ${selected.length} term(s) and assign to "${selectedTermType?.name || 'selected term type'}"?`)) return;
        setImportCreating(true);
        const log = [];
        let created = 0;
        let skipped = 0;
        const existingNames = new Set((assignedTerms || []).map(t => (t.name || '').toLowerCase().trim()));
        try {
            for (let i = 0; i < importRows.length; i++) {
                const row = importRows[i];
                if (!row._selected || !row.name.trim()) continue;
                const trimmedName = row.name.trim();
                if (existingNames.has(trimmedName.toLowerCase())) {
                    setImportRows(prev => prev.map((r, idx) => idx === i ? { ...r, _status: 'duplicate' } : r));
                    log.push({ type: 'warning', text: `Skipped "${trimmedName}" (already exists)` });
                    skipped++;
                    continue;
                }
                try {
                    const payload = {
                        name: trimmedName,
                        slug: row.slug.trim() || undefined,
                        term_types: { connect: [selectedTermTypeId] }
                    };
                    await authApi.post('/terms', { data: payload });
                    existingNames.add(trimmedName.toLowerCase());
                    setImportRows(prev => prev.map((r, idx) => idx === i ? { ...r, _status: 'created' } : r));
                    created++;
                } catch (err) {
                    console.error(`Failed to create term "${trimmedName}"`, err);
                    setImportRows(prev => prev.map((r, idx) => idx === i ? { ...r, _status: 'error' } : r));
                    log.push({ type: 'danger', text: `Failed: "${trimmedName}" — ${err.message || 'Error'}` });
                }
            }
            log.unshift({ type: 'success', text: `Import complete: ${created} created, ${skipped} skipped` });
            setImportLog(log);
            await loadData();
        } catch (err) {
            console.error('Bulk create failed', err);
            log.unshift({ type: 'danger', text: 'Bulk create failed: ' + (err.message || 'Unknown error') });
            setImportLog(log);
        } finally {
            setImportCreating(false);
        }
    }

    const selectedTermType = termTypes.find((type) => getEntryId(type) === selectedTermTypeId);
    const assignedTerms = selectedTermType?.terms || [];
    const assignedIds = useMemo(
        () => new Set(assignedTerms.map((term) => getEntryKey(term))),
        [assignedTerms]
    );
    const termListSource = termSearch.trim() ? termSearchResults : terms;
    const availableTerms = termListSource.filter((term) => !assignedIds.has(getEntryKey(term)));
    const mergeCandidates = termTypes.filter((type) => getEntryId(type) !== selectedTermTypeId);
    const filteredMergeCandidates = mergeCandidates.filter((type) =>
        (type?.name || "").toLowerCase().includes(mergeSearch.trim().toLowerCase())
    );

    return (
        <ProtectedRoute>
            <Layout>
                <div className="p-3">
                    <h1>Term Types</h1>
                    {loading && <div className="text-muted mb-2">Loading...</div>}
                    <div className="row">
                        <div className="col-lg-8">
                            <div className="card mb-3">
                                <div className="card-body">
                                    <div className="d-flex flex-wrap justify-content-between align-items-center mb-2">
                                        <h5 className="card-title mb-0">Term Types</h5>
                                        <div className="d-flex gap-2">
                                            <button
                                                type="button"
                                                className="btn btn-outline-primary"
                                                onClick={handleEditTermType}
                                                disabled={!selectedTermTypeId}
                                            >
                                                Edit {selectedTermType?.name || "term type"}
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-outline-danger"
                                                onClick={openMergeDialog}
                                            >
                                                Merge {selectedTermType?.name ? `into ${selectedTermType.name}` : "term types"}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-2">
                                        {termTypes.map((type) => {
                                            const id = getEntryId(type);
                                            const isActive = id === selectedTermTypeId;
                                            return (
                                                <div key={id} className="col">
                                                    <button
                                                        type="button"
                                                        className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center w-100 ${
                                                            isActive ? "active" : ""
                                                        }`}
                                                        style={{ cursor: "pointer" }}
                                                        onClick={() => setSelectedTermTypeId(id)}
                                                    >
                                                        <span>{type.name}</span>
                                                        <span className={`badge ${isActive ? "bg-light text-dark" : "bg-secondary"}`}>
                                                            {type.terms?.length || 0}
                                                        </span>
                                                    </button>
                                                </div>
                                            );
                                        })}
                                        {termTypes.length === 0 && (
                                            <div className="col">
                                                <div className="list-group-item">No term types yet.</div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="card mb-3">
                                <div className="card-body">
                                    <h5 className="card-title">
                                        Assigned terms {selectedTermType ? `for ${selectedTermType.name}` : ""}
                                    </h5>
                                    {!selectedTermType && (
                                        <div className="text-muted">Select a term type to manage.</div>
                                    )}
                                    {selectedTermType && (
                                        <div className="row row-cols-1 row-cols-md-2 g-2">
                                            {assignedTerms.map((term) => {
                                                const termId = getEntryId(term);
                                                return (
                                                    <div key={termId} className="col">
                                                        <div className="list-group-item d-flex justify-content-between align-items-center">
                                                            <span>{term.name}</span>
                                                            <button
                                                                type="button"
                                                                className="btn btn-sm btn-outline-danger"
                                                                onClick={() => handleRemoveTerm(termId)}
                                                            >
                                                                Remove
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {assignedTerms.length === 0 && (
                                                <div className="col">
                                                    <div className="list-group-item">No terms assigned yet.</div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="col-lg-4">
                            <div className="card mb-3">
                                <div className="card-body">
                                    <h5 className="card-title">{isEditingTermType ? "Edit Term Type" : "Create Term Type"}</h5>
                                    <form onSubmit={handleCreateTermType}>
                                        <div className="mb-2">
                                            <input
                                                className="form-control"
                                                name="name"
                                                value={termTypeForm.name}
                                                onChange={handleTermTypeChange}
                                                placeholder="Term type name"
                                                required
                                            />
                                        </div>
                                        <div className="mb-2">
                                            <input
                                                className="form-control"
                                                name="slug"
                                                value={termTypeForm.slug}
                                                onChange={handleTermTypeChange}
                                                placeholder="Slug (optional)"
                                            />
                                        </div>
                                        <div className="mb-2 d-flex gap-3">
                                            <label className="form-check-label">
                                                <input
                                                    className="form-check-input me-2"
                                                    type="checkbox"
                                                    name="is_variant"
                                                    checked={termTypeForm.is_variant}
                                                    onChange={handleTermTypeChange}
                                                />
                                                Variant
                                            </label>
                                            <label className="form-check-label">
                                                <input
                                                    className="form-check-input me-2"
                                                    type="checkbox"
                                                    name="is_public"
                                                    checked={termTypeForm.is_public}
                                                    onChange={handleTermTypeChange}
                                                />
                                                Public
                                            </label>
                                        </div>
                                        <div className="d-flex gap-2">
                                            <button className="btn btn-primary" type="submit">
                                                {isEditingTermType ? "Save Term Type" : "Create Term Type"}
                                            </button>
                                            {isEditingTermType && (
                                                <button
                                                    type="button"
                                                    className="btn btn-outline-secondary"
                                                    onClick={() => {
                                                        setIsEditingTermType(false);
                                                        setTermTypeForm({ name: "", slug: "", is_variant: false, is_public: true });
                                                    }}
                                                >
                                                    Cancel
                                                </button>
                                            )}
                                        </div>
                                    </form>
                                </div>
                            </div>

                            <div className="card mb-3">
                                <div className="card-body">
                                    <h5 className="card-title">Create new term</h5>
                                    <form onSubmit={handleCreateTerm}>
                                        <div className="mb-2">
                                            <input
                                                className="form-control"
                                                name="name"
                                                value={termForm.name}
                                                onChange={handleTermChange}
                                                placeholder="Term name"
                                                required
                                            />
                                        </div>
                                        <div className="mb-2">
                                            <input
                                                className="form-control"
                                                name="slug"
                                                value={termForm.slug}
                                                onChange={handleTermChange}
                                                placeholder="Slug (optional)"
                                            />
                                        </div>
                                        <button className="btn btn-success" type="submit">
                                            Create Term
                                        </button>
                                    </form>
                                </div>
                            </div>

                            <div className="card mb-3">
                                <div className="card-body">
                                    <h5 className="card-title">
                                        <i className="fas fa-file-import me-2" />
                                        Bulk Import Terms
                                    </h5>
                                    <p className="text-muted small mb-2">
                                        Upload a CSV or Excel file with <strong>name</strong> and optional <strong>slug</strong> columns to create multiple terms at once.
                                    </p>
                                    <div className="mb-2">
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            className="form-control form-control-sm"
                                            accept=".csv,.xlsx,.xls"
                                            onChange={handleImportFile}
                                            disabled={importParsing || importCreating}
                                        />
                                    </div>
                                    {importParsing && <div className="text-muted small mb-2"><i className="fas fa-spinner fa-spin me-1" />Parsing file...</div>}
                                    {importLog.map((log, i) => (
                                        <div key={i} className={`alert alert-${log.type} py-1 px-2 small mb-1`}>{log.text}</div>
                                    ))}
                                    {importRows.length > 0 && (
                                        <>
                                            <div className="d-flex justify-content-between align-items-center mb-2 mt-2">
                                                <span className="small fw-bold">{importRows.filter(r => r._selected).length} of {importRows.length} selected</span>
                                                <div className="d-flex gap-1">
                                                    <button type="button" className="btn btn-outline-secondary btn-sm" onClick={toggleAllImportRows} disabled={importCreating}>
                                                        {importRows.every(r => r._selected) ? 'Unselect All' : 'Select All'}
                                                    </button>
                                                    <button type="button" className="btn btn-outline-danger btn-sm" onClick={clearImport} disabled={importCreating}>
                                                        Clear
                                                    </button>
                                                </div>
                                            </div>
                                            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                                <table className="table table-sm table-bordered align-middle mb-0">
                                                    <thead className="table-light" style={{ position: 'sticky', top: 0 }}>
                                                        <tr>
                                                            <th style={{ width: '30px' }}>
                                                                <input type="checkbox" className="form-check-input" checked={importRows.every(r => r._selected)} onChange={toggleAllImportRows} disabled={importCreating} />
                                                            </th>
                                                            <th>Name</th>
                                                            <th>Slug</th>
                                                            <th style={{ width: '60px' }}>Status</th>
                                                            <th style={{ width: '30px' }}></th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {importRows.map((row, i) => (
                                                            <tr key={row._key} className={row._status === 'created' ? 'table-success' : row._status === 'error' ? 'table-danger' : row._status === 'duplicate' ? 'table-warning' : ''}>
                                                                <td>
                                                                    <input type="checkbox" className="form-check-input" checked={row._selected} onChange={() => toggleImportRow(i)} disabled={importCreating || row._status === 'created'} />
                                                                </td>
                                                                <td>
                                                                    <input className="form-control form-control-sm" value={row.name} onChange={(e) => updateImportRow(i, 'name', e.target.value)} disabled={importCreating || row._status === 'created'} />
                                                                </td>
                                                                <td>
                                                                    <input className="form-control form-control-sm" value={row.slug} onChange={(e) => updateImportRow(i, 'slug', e.target.value)} placeholder="auto" disabled={importCreating || row._status === 'created'} />
                                                                </td>
                                                                <td className="text-center">
                                                                    {row._status === 'created' && <span className="badge bg-success"><i className="fas fa-check" /></span>}
                                                                    {row._status === 'error' && <span className="badge bg-danger"><i className="fas fa-times" /></span>}
                                                                    {row._status === 'duplicate' && <span className="badge bg-warning text-dark">Dup</span>}
                                                                    {!row._status && <span className="text-muted">—</span>}
                                                                </td>
                                                                <td>
                                                                    <button type="button" className="btn btn-sm btn-outline-danger p-0 px-1" onClick={() => removeImportRow(i)} disabled={importCreating} title="Remove row">
                                                                        <i className="fas fa-times" />
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                            <button
                                                type="button"
                                                className="btn btn-success btn-sm mt-2 w-100"
                                                onClick={handleBulkCreateTerms}
                                                disabled={!selectedTermTypeId || importCreating || importRows.filter(r => r._selected && r.name.trim()).length === 0}
                                            >
                                                {importCreating
                                                    ? <><i className="fas fa-spinner fa-spin me-1" />Creating...</>
                                                    : <><i className="fas fa-upload me-1" />Create {importRows.filter(r => r._selected && r.name.trim()).length} Term(s) into "{selectedTermType?.name || '...'}"
                                                    </>}
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="card">
                                <div className="card-body">
                                    <h5 className="card-title">Add existing term</h5>
                                    <input
                                        className="form-control mb-2"
                                        placeholder="Search terms"
                                        value={termSearch}
                                        onChange={(e) => setTermSearch(e.target.value)}
                                    />
                                    {isTermSearchLoading && (
                                        <div className="text-muted mb-2">Searching terms...</div>
                                    )}
                                    <div className="row row-cols-1 row-cols-md-2 g-2 mb-2">
                                        {availableTerms.map((term) => {
                                            const termId = getEntryId(term);
                                            const termKey = getEntryKey(term);
                                            return (
                                                <div key={termKey} className="col">
                                                    <div className="list-group-item d-flex justify-content-between align-items-center">
                                                        <span>{term.name}</span>
                                                        <button
                                                            type="button"
                                                            className="btn btn-sm btn-outline-primary"
                                                            onClick={() => handleAddExistingTerm(termId)}
                                                            disabled={!selectedTermTypeId || !termId}
                                                        >
                                                            Add
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        {availableTerms.length === 0 && (
                                            <div className="col">
                                                <div className="list-group-item text-muted">
                                                    {termSearch.trim() ? "No matching terms." : "No terms available."}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </Layout>
            {isMergeOpen && (
                <div className="modal show d-block" tabIndex="-1" role="dialog" onClick={closeMergeDialog}>
                    <div
                        className="modal-dialog modal-lg modal-dialog-centered"
                        role="document"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className="modal-title">Merge term types</h5>
                                <button type="button" className="btn-close" onClick={closeMergeDialog}></button>
                            </div>
                            <div className="modal-body">
                                <p className="text-muted mb-2">
                                    Target term type: <strong>{selectedTermType?.name}</strong>
                                </p>
                                <input
                                    className="form-control mb-2"
                                    placeholder="Search term types"
                                    value={mergeSearch}
                                    onChange={(e) => setMergeSearch(e.target.value)}
                                />
                                <div className="list-group">
                                    {filteredMergeCandidates.map((type) => {
                                        const typeId = getEntryId(type);
                                        const isSelected = mergeSelection.has(typeId);
                                        return (
                                            <button
                                                key={typeId}
                                                type="button"
                                                className={`list-group-item list-group-item-action ${
                                                    isSelected ? "active" : ""
                                                }`}
                                                onClick={() => {
                                                    setMergeSelection((prev) => {
                                                        const next = new Set(prev);
                                                        if (next.has(typeId)) {
                                                            next.delete(typeId);
                                                        } else {
                                                            next.add(typeId);
                                                        }
                                                        return next;
                                                    });
                                                }}
                                            >
                                                {type.name}
                                            </button>
                                        );
                                    })}
                                    {filteredMergeCandidates.length === 0 && (
                                        <div className="list-group-item text-muted">No term types found.</div>
                                    )}
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={closeMergeDialog}>
                                    Cancel
                                </button>
                                <button type="button" className="btn btn-danger" onClick={handleMergeTermTypes}>
                                    Merge selected term types
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </ProtectedRoute>
    );
}


