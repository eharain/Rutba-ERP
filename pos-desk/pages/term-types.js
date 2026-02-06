import { useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "../components/ProtectedRoute";
import { authApi } from "../lib/api";

export default function TermTypesPage() {
    const [termTypes, setTermTypes] = useState([]);
    const [terms, setTerms] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedTermTypeId, setSelectedTermTypeId] = useState("");
    const [termTypeForm, setTermTypeForm] = useState({
        name: "",
        slug: "",
        is_variant: false,
        is_public: true
    });
    const [termForm, setTermForm] = useState({ name: "", slug: "" });
    const [selectedTermId, setSelectedTermId] = useState("");
    const [termSearch, setTermSearch] = useState("");
    const [mergeSearch, setMergeSearch] = useState("");
    const [mergeSelection, setMergeSelection] = useState(new Set());

    useEffect(() => {
        loadData();
    }, []);

    function getEntryId(entry) {
        return entry?.documentId || entry?.id;
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
            await loadData();
        } catch (error) {
            console.error("Failed to merge term types", error);
            alert("Failed to merge term types");
        } finally {
            setLoading(false);
        }
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

    async function handleCreateTermType(e) {
        e.preventDefault();
        setLoading(true);
        try {
            const payload = {
                name: termTypeForm.name,
                slug: termTypeForm.slug || undefined,
                is_variant: termTypeForm.is_variant,
                is_public: termTypeForm.is_public
            };
            const res = await authApi.post("/term-types", { data: payload });
            const created = res?.data ?? res;
            setTermTypeForm({ name: "", slug: "", is_variant: false, is_public: true });
            await loadData();
            setSelectedTermTypeId(getEntryId(created));
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

    async function handleAddExistingTerm() {
        if (!selectedTermTypeId) return alert("Select a term type first");
        if (!selectedTermId) return alert("Select a term to add");
        setLoading(true);
        try {
            await authApi.put(`/term-types/${selectedTermTypeId}`, {
                data: { terms: { connect: [selectedTermId] } }
            });
            setSelectedTermId("");
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
        () => new Set(assignedTerms.map((term) => getEntryId(term))),
        [assignedTerms]
    );
    const availableTerms = terms.filter((term) => !assignedIds.has(getEntryId(term)));
    const filteredTerms = availableTerms.filter((term) =>
        (term?.name || "").toLowerCase().includes(termSearch.trim().toLowerCase())
    );
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
                        <div className="col-lg-5">
                            <div className="card mb-3">
                                <div className="card-body">
                                    <h5 className="card-title">Create Term Type</h5>
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
                                        <button className="btn btn-primary" type="submit">
                                            Create Term Type
                                        </button>
                                    </form>
                                </div>
                            </div>

                            <div className="card">
                                <div className="card-body">
                                    <h5 className="card-title">Term Types</h5>
                                    <ul className="list-group">
                                        {termTypes.map((type) => {
                                            const id = getEntryId(type);
                                            const isActive = id === selectedTermTypeId;
                                            return (
                                                <li
                                                    key={id}
                                                    className={`list-group-item d-flex justify-content-between align-items-center ${
                                                        isActive ? "active" : ""
                                                    }`}
                                                    style={{ cursor: "pointer" }}
                                                    onClick={() => setSelectedTermTypeId(id)}
                                                >
                                                    <span>{type.name}</span>
                                                    <span className="badge bg-secondary">
                                                        {type.terms?.length || 0}
                                                    </span>
                                                </li>
                                            );
                                        })}
                                        {termTypes.length === 0 && (
                                            <li className="list-group-item">No term types yet.</li>
                                        )}
                                    </ul>
                                </div>
                            </div>
                        </div>

                        <div className="col-lg-7">
                            <div className="card mb-3">
                                <div className="card-body">
                                    <h5 className="card-title">
                                        Manage Terms {selectedTermType ? `for ${selectedTermType.name}` : ""}
                                    </h5>
                                    {!selectedTermType && (
                                        <div className="text-muted">Select a term type to manage.</div>
                                    )}
                                    {selectedTermType && (
                                        <>
                                            <div className="mb-3">
                                                <label className="form-label">Add existing term</label>
                                                <input
                                                    className="form-control mb-2"
                                                    placeholder="Search terms"
                                                    value={termSearch}
                                                    onChange={(e) => setTermSearch(e.target.value)}
                                                />
                                                <div className="list-group mb-2">
                                                    {filteredTerms.map((term) => {
                                                        const termId = getEntryId(term);
                                                        return (
                                                            <button
                                                                key={termId}
                                                                type="button"
                                                                className={`list-group-item list-group-item-action ${
                                                                    selectedTermId === termId ? "active" : ""
                                                                }`}
                                                                onClick={() => setSelectedTermId(termId)}
                                                            >
                                                                {term.name}
                                                            </button>
                                                        );
                                                    })}
                                                    {filteredTerms.length === 0 && (
                                                        <div className="list-group-item text-muted">No matching terms.</div>
                                                    )}
                                                </div>
                                                <button
                                                    type="button"
                                                    className="btn btn-outline-primary"
                                                    onClick={handleAddExistingTerm}
                                                >
                                                    Add selected term
                                                </button>
                                            </div>

                                            <div className="mb-3">
                                                <label className="form-label">Merge other term types into this</label>
                                                <input
                                                    className="form-control mb-2"
                                                    placeholder="Search term types"
                                                    value={mergeSearch}
                                                    onChange={(e) => setMergeSearch(e.target.value)}
                                                />
                                                <div className="list-group mb-2">
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
                                                <button
                                                    type="button"
                                                    className="btn btn-outline-danger"
                                                    onClick={handleMergeTermTypes}
                                                >
                                                    Merge selected term types
                                                </button>
                                            </div>

                                            <form onSubmit={handleCreateTerm} className="mb-3">
                                                <h6>Create new term</h6>
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

                                            <h6>Assigned terms</h6>
                                            <ul className="list-group">
                                                {assignedTerms.map((term) => {
                                                    const termId = getEntryId(term);
                                                    return (
                                                        <li
                                                            key={termId}
                                                            className="list-group-item d-flex justify-content-between align-items-center"
                                                        >
                                                            <span>{term.name}</span>
                                                            <button
                                                                type="button"
                                                                className="btn btn-sm btn-outline-danger"
                                                                onClick={() => handleRemoveTerm(termId)}
                                                            >
                                                                Remove
                                                            </button>
                                                        </li>
                                                    );
                                                })}
                                                {assignedTerms.length === 0 && (
                                                    <li className="list-group-item">No terms assigned yet.</li>
                                                )}
                                            </ul>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </Layout>
        </ProtectedRoute>
    );
}
