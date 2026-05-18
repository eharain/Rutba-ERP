import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { CategoryGroupsEndpoints } from "@rutba/api-provider/endpoints";
import Link from "next/link";
import { useToast } from "../components/Toast";
import ListPageLayout, { AddButton } from "@rutba/pos-shared/components/ListPageLayout";
import ListPagination from "@rutba/pos-shared/components/ListPagination";
import ExcelIO from "../components/ExcelIO";
import { SEO_EXCEL_COLUMNS, SEO_POPULATE, makeSeoUpsert } from "../components/seoExcel";

const CATEGORY_GROUP_EXCEL_COLUMNS = [
    { key: "name", isLabel: true, width: 32 },
    { key: "slug", width: 22 },
    { key: "summary", width: 60 },
    { key: "description", width: 90 },
    ...SEO_EXCEL_COLUMNS,
];

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200];

export default function CategoryGroups() {
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

    const publishOne = async (docId) => {
        setPublishing(prev => ({ ...prev, [docId]: true }));
        try {
            await CategoryGroupsEndpoints.publish(docId);
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
            await CategoryGroupsEndpoints.unpublish(docId);
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
            try { await CategoryGroupsEndpoints.publish(docId); ok++; setGroups(prev => prev.map(g => g.documentId === docId ? { ...g, _isPublished: true } : g)); }
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
            try { await CategoryGroupsEndpoints.unpublish(docId); ok++; setGroups(prev => prev.map(g => g.documentId === docId ? { ...g, _isPublished: false } : g)); }
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
                CategoryGroupsEndpoints.listDraft({ sort: ["sort_order:asc", "createdAt:desc"], populate: { categories: true, ...SEO_POPULATE }, page, pageSize }),
                CategoryGroupsEndpoints.listPublished({ pageSize: 200 }),
            ]);
            const pubIds = new Set((pubRes.data || []).map(g => g.documentId));
            setGroups((draftRes.data || []).map(g => ({ ...g, _isPublished: pubIds.has(g.documentId) })));
            setTotal(draftRes.meta?.pagination?.total ?? 0);
        } catch (err) {
            console.error("Failed to load category groups", err);
        } finally {
            setLoading(false);
        }
    }, [jwt, page, pageSize]);

    useEffect(() => { load(); }, [load]);

    const fetchAllGroups = useCallback(async () => {
        const out = [];
        let p = 1;
        const PAGE = 100;
        while (true) {
            const res = await CategoryGroupsEndpoints.listDraft({
                sort: ["sort_order:asc", "createdAt:desc"],
                populate: { categories: true, ...SEO_POPULATE },
                page: p,
                pageSize: PAGE,
            });
            const arr = res.data || [];
            out.push(...arr);
            if (arr.length < PAGE) break;
            p += 1;
            if (p > 500) break;
        }
        return out;
    }, []);

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <ListPageLayout
                    title="Category Groups"
                    subtitle="Category groups let you curate which categories appear on each CMS page."
                    headerActions={
                        <>
                            <ExcelIO
                                entityLabel="Category Groups"
                                contentType="api::category-group.category-group"
                                columns={CATEGORY_GROUP_EXCEL_COLUMNS}
                                rows={groups}
                                selectedIds={selectedIds}
                                total={total}
                                fetchAll={fetchAllGroups}
                                findExisting={async (row) => {
                                    if (!row.slug) return null;
                                    try {
                                        const res = await CategoryGroupsEndpoints.listDraft({ pagination: { pageSize: 1 }, filters: { slug: { $eq: row.slug } }, populate: SEO_POPULATE });
                                        return res.data?.[0] || null;
                                    } catch { return null; }
                                }}
                                create={(data) => CategoryGroupsEndpoints.create(data)}
                                update={(documentId, data) => CategoryGroupsEndpoints.updateDraft(documentId, data)}
                                onSecondary={makeSeoUpsert("category_group", "category-group")}
                                onAfterImport={load}
                            />
                            <AddButton label="New Category Group" href="/new/category-group" />
                        </>
                    }
                    bulkActions={
                        <>
                            <button className="btn btn-sm btn-success" onClick={bulkPublish}>
                                <i className="fas fa-upload me-1"></i>Publish
                            </button>
                            <button className="btn btn-sm btn-outline-secondary" onClick={bulkUnpublish}>
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
                    emptyState={<div>No category groups found.</div>}
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
                                                ? <button className="list-status btn border-0" style={{ background: '#198754', color: '#fff' }} onClick={() => unpublishOne(g.documentId)} disabled={publishing[g.documentId]} title="Click to unpublish">
                                                    {publishing[g.documentId] ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-check me-1"></i>Published</>}
                                                </button>
                                                : <button className="list-status btn border-0" style={{ background: '#e9ecef', color: '#495057' }} onClick={() => publishOne(g.documentId)} disabled={publishing[g.documentId]} title="Click to publish">
                                                    {publishing[g.documentId] ? <i className="fas fa-spinner fa-spin"></i> : "Draft"}
                                                </button>
                                            }
                                        </td>
                                        <td>
                                            <div className="list-actions">
                                                <Link className="btn btn-outline-primary" href={`/${g.documentId}/category-group`}>
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

