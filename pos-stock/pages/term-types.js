import { useEffect, useMemo, useState } from "react";
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


export async function getServerSideProps() { return { props: {} }; }
