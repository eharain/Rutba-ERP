import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";
import Link from "next/link";
import { useToast } from "../components/Toast";

export default function CategoryGroups() {
    const { jwt } = useAuth();
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
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

    const allPageIds = groups.map(g => g.documentId);
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
            await authApi.post(`/category-groups/${docId}/publish`, {});
            setGroups(prev => prev.map(g => g.documentId === docId ? { ...g, _isPublished: true } : g));
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
            await authApi.post(`/category-groups/${docId}/unpublish`, {});
            setGroups(prev => prev.map(g => g.documentId === docId ? { ...g, _isPublished: false } : g));
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
        if (!confirm(`Publish ${ids.length} category group(s)?`)) return;
        let ok = 0, fail = 0;
        for (const docId of ids) {
            setPublishing(prev => ({ ...prev, [docId]: true }));
            try { await authApi.post(`/category-groups/${docId}/publish`, {}); ok++; setGroups(prev => prev.map(g => g.documentId === docId ? { ...g, _isPublished: true } : g)); }
            catch { fail++; }
            finally { setPublishing(prev => ({ ...prev, [docId]: false })); }
        }
        toast(`Published ${ok} category group(s)${fail ? `, ${fail} failed` : ""}.`, fail ? "warning" : "success");
        setSelectedIds(new Set());
    };

    const bulkUnpublish = async () => {
        const ids = [...selectedIds];
        if (ids.length === 0) { toast("No items selected.", "warning"); return; }
        if (!confirm(`Unpublish ${ids.length} category group(s)?`)) return;
        let ok = 0, fail = 0;
        for (const docId of ids) {
            setPublishing(prev => ({ ...prev, [docId]: true }));
            try { await authApi.post(`/category-groups/${docId}/unpublish`, {}); ok++; setGroups(prev => prev.map(g => g.documentId === docId ? { ...g, _isPublished: false } : g)); }
            catch { fail++; }
            finally { setPublishing(prev => ({ ...prev, [docId]: false })); }
        }
        toast(`Unpublished ${ok} category group(s)${fail ? `, ${fail} failed` : ""}.`, fail ? "warning" : "success");
        setSelectedIds(new Set());
    };

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const [draftRes, pubRes] = await Promise.all([
                authApi.get("/category-groups", {
                    status: 'draft',
                    sort: ["sort_order:asc", "createdAt:desc"],
                    populate: ["categories"],
                    pagination: { pageSize: 50 },
                }),
                authApi.get("/category-groups", { status: 'published', fields: ["documentId"], pagination: { pageSize: 200 } }),
            ]);
            const pubIds = new Set((pubRes.data || []).map(g => g.documentId));
            setGroups((draftRes.data || []).map(g => ({ ...g, _isPublished: pubIds.has(g.documentId) })));
        } catch (err) {
            console.error("Failed to load category groups", err);
        } finally {
            setLoading(false);
        }
    }, [jwt]);

    useEffect(() => { load(); }, [load]);

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <div className="d-flex align-items-center justify-content-between mb-3">
                    <h2 className="mb-0">Category Groups</h2>
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
                        <Link className="btn btn-primary btn-sm" href="/new/category-group">
                            <i className="fas fa-plus me-1"></i>New Category Group
                        </Link>
                    </div>
                </div>

                <p className="text-muted small mb-3">
                    Category groups let you curate which categories appear on each CMS page.
                </p>

                {loading && <p>Loading category groups...</p>}

                {!loading && groups.length === 0 && (
                    <div className="alert alert-info">No category groups found.</div>
                )}

                {!loading && groups.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr>
                                    <th style={{ width: 30 }}>
                                        <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} title="Select all" />
                                    </th>
                                    <th>Name</th>
                                    <th>Slug</th>
                                    <th>Categories</th>
                                    <th>Order</th>
                                    <th>Published</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {groups.map(g => (
                                    <tr key={g.id}>
                                        <td>
                                            <input type="checkbox" checked={selectedIds.has(g.documentId)} onChange={() => toggleSelected(g.documentId)} />
                                        </td>
                                        <td>{g.name}</td>
                                        <td><code>{g.slug}</code></td>
                                        <td><span className="badge bg-primary">{(g.categories || []).length}</span></td>
                                        <td>{g.sort_order}</td>
                                        <td>
                                            {g._isPublished
                                                ? <button className="btn btn-sm btn-success py-0 px-1" onClick={() => unpublishOne(g.documentId)} disabled={publishing[g.documentId]} title="Click to unpublish">
                                                    {publishing[g.documentId] ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-check me-1"></i>Published</>}
                                                </button>
                                                : <button className="btn btn-sm btn-outline-secondary py-0 px-1" onClick={() => publishOne(g.documentId)} disabled={publishing[g.documentId]} title="Click to publish">
                                                    {publishing[g.documentId] ? <i className="fas fa-spinner fa-spin"></i> : "Draft"}
                                                </button>
                                            }
                                        </td>
                                        <td>
                                            <Link className="btn btn-sm btn-outline-primary" href={`/${g.documentId}/category-group`}>
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

