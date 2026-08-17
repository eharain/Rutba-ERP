import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { CmsPageGroupsEndpoints } from "@rutba/api-provider/endpoints";
import Link from "next/link";
import { useToast } from "../components/Toast";
import ListPageLayout, { AddButton } from "@rutba/pos-shared/components/ListPageLayout";
import ListPagination from "@rutba/pos-shared/components/ListPagination";

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200];

export default function CmsPageGroups() {
    const { jwt } = useAuth();
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
    const [total, setTotal] = useState(0);
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

    const setPub = async (docId, publish) => {
        setPublishing(prev => ({ ...prev, [docId]: true }));
        try {
            await (publish ? CmsPageGroupsEndpoints.publish(docId) : CmsPageGroupsEndpoints.unpublish(docId));
            setGroups(prev => prev.map(g => g.documentId === docId ? { ...g, _isPublished: publish } : g));
            toast(publish ? "Published!" : "Unpublished.", "success");
        } catch (err) {
            console.error("Failed to change publish state", err);
            toast("Failed.", "danger");
        } finally {
            setPublishing(prev => ({ ...prev, [docId]: false }));
        }
    };

    const bulkSetPub = async (publish) => {
        const ids = [...selectedIds];
        if (ids.length === 0) { toast("No items selected.", "warning"); return; }
        if (!confirm(`${publish ? "Publish" : "Unpublish"} ${ids.length} page group(s)?`)) return;
        let ok = 0, fail = 0;
        for (const docId of ids) {
            setPublishing(prev => ({ ...prev, [docId]: true }));
            try { await (publish ? CmsPageGroupsEndpoints.publish(docId) : CmsPageGroupsEndpoints.unpublish(docId)); ok++; setGroups(prev => prev.map(g => g.documentId === docId ? { ...g, _isPublished: publish } : g)); }
            catch { fail++; }
            finally { setPublishing(prev => ({ ...prev, [docId]: false })); }
        }
        toast(`${publish ? "Published" : "Unpublished"} ${ok}${fail ? `, ${fail} failed` : ""}.`, fail ? "warning" : "success");
        setSelectedIds(new Set());
    };

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const [draftRes, pubRes] = await Promise.all([
                CmsPageGroupsEndpoints.listDraft({ sort: ["sort_order:asc", "createdAt:desc"], populate: { pages: true }, page, pageSize }),
                CmsPageGroupsEndpoints.listPublished({ pageSize: 200 }),
            ]);
            const pubIds = new Set((pubRes.data || []).map(g => g.documentId));
            setGroups((draftRes.data || []).map(g => ({ ...g, _isPublished: pubIds.has(g.documentId) })));
            setTotal(draftRes.meta?.pagination?.total ?? 0);
        } catch (err) {
            console.error("Failed to load page groups", err);
        } finally {
            setLoading(false);
        }
    }, [jwt, page, pageSize]);

    useEffect(() => { load(); }, [load]);

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <ListPageLayout
                    title="Page Groups"
                    subtitle="Curate a set of CMS pages and show them as a flip-card grid. Attach a group to any page (in the page editor) to render it as a section."
                    headerActions={<AddButton label="New Page Group" href="/new/cms-page-group" />}
                    bulkActions={
                        <>
                            <button className="btn btn-sm btn-success" onClick={() => bulkSetPub(true)}>
                                <i className="fas fa-upload me-1"></i>Publish
                            </button>
                            <button className="btn btn-sm btn-outline-secondary" onClick={() => bulkSetPub(false)}>
                                <i className="fas fa-eye-slash me-1"></i>Unpublish
                            </button>
                        </>
                    }
                    selectedCount={selectedIds.size}
                    loading={loading}
                    pagination={
                        <ListPagination
                            page={page}
                            pageSize={pageSize}
                            total={total}
                            onPage={setPage}
                            onPageSize={(s) => { setPageSize(s); setPage(1); }}
                            pageSizeOptions={PAGE_SIZE_OPTIONS}
                        />
                    }
                    emptyState={<div>No page groups found.</div>}
                >
                    {groups.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-hover list-table">
                            <thead>
                                <tr>
                                    <th style={{ width: 30 }}>
                                        <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} title="Select all" />
                                    </th>
                                    <th>Name</th>
                                    <th>Slug</th>
                                    <th>Layout</th>
                                    <th>Pages</th>
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
                                        <td><span className="badge bg-light text-dark">{g.layout || "flip-grid"}</span></td>
                                        <td><span className="badge bg-primary">{(g.pages || []).length}</span></td>
                                        <td>{g.sort_order}</td>
                                        <td>
                                            {g._isPublished
                                                ? <button className="list-status btn border-0" style={{ background: '#198754', color: '#fff' }} onClick={() => setPub(g.documentId, false)} disabled={publishing[g.documentId]} title="Click to unpublish">
                                                    {publishing[g.documentId] ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-check me-1"></i>Published</>}
                                                </button>
                                                : <button className="list-status btn border-0" style={{ background: '#e9ecef', color: '#495057' }} onClick={() => setPub(g.documentId, true)} disabled={publishing[g.documentId]} title="Click to publish">
                                                    {publishing[g.documentId] ? <i className="fas fa-spinner fa-spin"></i> : "Draft"}
                                                </button>
                                            }
                                        </td>
                                        <td>
                                            <div className="list-actions">
                                                <Link className="btn btn-outline-primary" href={`/${g.documentId}/cms-page-group`}>
                                                    Edit
                                                </Link>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    )}
                </ListPageLayout>
            </Layout>
        </ProtectedRoute>
    );
}
