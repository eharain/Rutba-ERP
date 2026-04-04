import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi, StraipImageUrl } from "@rutba/pos-shared/lib/api";
import Link from "next/link";
import { useToast } from "../components/Toast";

export default function Brands() {
    const { jwt } = useAuth();
    const [brands, setBrands] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const { toast, ToastContainer } = useToast();
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [publishing, setPublishing] = useState({});

    const toggleSelected = (docId) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(docId)) next.delete(docId); else next.add(docId);
            return next;
        });
    };

    const allPageIds = brands.map(b => b.documentId);
    const allSelected = allPageIds.length > 0 && allPageIds.every(id => selectedIds.has(id));
    const toggleSelectAll = () => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (allSelected) { allPageIds.forEach(id => next.delete(id)); } else { allPageIds.forEach(id => next.add(id)); }
            return next;
        });
    };

    const publishOne = async (docId) => {
        setPublishing(prev => ({ ...prev, [docId]: true }));
        try {
            await authApi.post(`/brands/${docId}/publish`, {});
            setBrands(prev => prev.map(b => b.documentId === docId ? { ...b, _isPublished: true } : b));
            toast("Published!", "success");
        } catch (err) {
            console.error("Failed to publish", err);
            toast("Failed to publish.", "danger");
        } finally {
            setPublishing(prev => ({ ...prev, [docId]: false }));
        }
    };

    const unpublishOne = async (docId) => {
        setPublishing(prev => ({ ...prev, [docId]: true }));
        try {
            await authApi.post(`/brands/${docId}/unpublish`, {});
            setBrands(prev => prev.map(b => b.documentId === docId ? { ...b, _isPublished: false } : b));
            toast("Unpublished.", "success");
        } catch (err) {
            console.error("Failed to unpublish", err);
            toast("Failed to unpublish.", "danger");
        } finally {
            setPublishing(prev => ({ ...prev, [docId]: false }));
        }
    };

    const bulkPublish = async () => {
        const ids = [...selectedIds];
        if (ids.length === 0) { toast("No items selected.", "warning"); return; }
        if (!confirm(`Publish ${ids.length} brand(s)?`)) return;
        let ok = 0, fail = 0;
        for (const docId of ids) {
            setPublishing(prev => ({ ...prev, [docId]: true }));
            try { await authApi.post(`/brands/${docId}/publish`, {}); ok++; setBrands(prev => prev.map(b => b.documentId === docId ? { ...b, _isPublished: true } : b)); }
            catch { fail++; }
            finally { setPublishing(prev => ({ ...prev, [docId]: false })); }
        }
        toast(`Published ${ok} brand(s)${fail ? `, ${fail} failed` : ""}.`, fail ? "warning" : "success");
        setSelectedIds(new Set());
    };

    const bulkUnpublish = async () => {
        const ids = [...selectedIds];
        if (ids.length === 0) { toast("No items selected.", "warning"); return; }
        if (!confirm(`Unpublish ${ids.length} brand(s)?`)) return;
        let ok = 0, fail = 0;
        for (const docId of ids) {
            setPublishing(prev => ({ ...prev, [docId]: true }));
            try { await authApi.post(`/brands/${docId}/unpublish`, {}); ok++; setBrands(prev => prev.map(b => b.documentId === docId ? { ...b, _isPublished: false } : b)); }
            catch { fail++; }
            finally { setPublishing(prev => ({ ...prev, [docId]: false })); }
        }
        toast(`Unpublished ${ok} brand(s)${fail ? `, ${fail} failed` : ""}.`, fail ? "warning" : "success");
        setSelectedIds(new Set());
    };

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const params = {
                status: 'draft',
                sort: ["name:asc"],
                populate: ["logo"],
                pagination: { pageSize: 100 },
            };
            if (search.trim()) {
                params.filters = { name: { $containsi: search.trim() } };
            }
            const [draftRes, pubRes] = await Promise.all([
                authApi.get("/brands", params),
                authApi.get("/brands", { status: 'published', fields: ["documentId"], pagination: { pageSize: 500 } }),
            ]);
            const pubIds = new Set((pubRes.data || []).map(b => b.documentId));
            setBrands((draftRes.data || []).map(b => ({ ...b, _isPublished: pubIds.has(b.documentId) })));
        } catch (err) {
            console.error("Failed to load brands", err);
        } finally {
            setLoading(false);
        }
    }, [jwt, search]);

    useEffect(() => { load(); }, [load]);

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <div className="d-flex align-items-center justify-content-between mb-3">
                    <h2 className="mb-0">Brands</h2>
                    <div className="d-flex align-items-center gap-2">
                        {selectedIds.size > 0 && (
                            <>
                                <span className="badge bg-primary">{selectedIds.size} selected</span>
                                <button className="btn btn-sm btn-success" onClick={bulkPublish}>
                                    <i className="fas fa-upload me-1"></i>Publish
                                </button>
                                <button className="btn btn-sm btn-outline-secondary" onClick={bulkUnpublish}>
                                    <i className="fas fa-eye-slash me-1"></i>Unpublish
                                </button>
                            </>
                        )}
                        <Link className="btn btn-primary btn-sm" href="/new/brand">
                            <i className="fas fa-plus me-1"></i>New Brand
                        </Link>
                    </div>
                </div>

                <div className="row g-2 mb-3">
                    <div className="col-md-4">
                        <input
                            type="text"
                            className="form-control form-control-sm"
                            placeholder="Search brands…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                </div>

                {loading && <p>Loading brands...</p>}

                {!loading && brands.length === 0 && (
                    <div className="alert alert-info">No brands found.</div>
                )}

                {!loading && brands.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr>
                                    <th style={{ width: 30 }}>
                                        <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} title="Select all" />
                                    </th>
                                    <th style={{ width: 50 }}></th>
                                    <th>Name</th>
                                    <th>Slug</th>
                                    <th>Published</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {brands.map(b => (
                                    <tr key={b.id}>
                                        <td>
                                            <input type="checkbox" checked={selectedIds.has(b.documentId)} onChange={() => toggleSelected(b.documentId)} />
                                        </td>
                                        <td>
                                            {b.logo?.url ? (
                                                <img src={StraipImageUrl(b.logo)} alt={b.name} style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 4 }} />
                                            ) : (
                                                <span className="text-muted"><i className="fas fa-copyright"></i></span>
                                            )}
                                        </td>
                                        <td>{b.name}</td>
                                        <td><code>{b.slug}</code></td>
                                        <td>
                                            {b._isPublished
                                                ? <button className="btn btn-sm btn-success py-0 px-1" onClick={() => unpublishOne(b.documentId)} disabled={publishing[b.documentId]} title="Click to unpublish">
                                                    {publishing[b.documentId] ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-check me-1"></i>Published</>}
                                                </button>
                                                : <button className="btn btn-sm btn-outline-secondary py-0 px-1" onClick={() => publishOne(b.documentId)} disabled={publishing[b.documentId]} title="Click to publish">
                                                    {publishing[b.documentId] ? <i className="fas fa-spinner fa-spin"></i> : "Draft"}
                                                </button>
                                            }
                                        </td>
                                        <td>
                                            <Link className="btn btn-sm btn-outline-primary" href={`/${b.documentId}/brand`}>
                                                Edit
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}

