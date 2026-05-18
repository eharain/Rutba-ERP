import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { CategoriesEndpoints, MediaUtilsEndpoints } from "@rutba/api-provider/endpoints";
import Link from "next/link";
import { useToast } from "../components/Toast";
import ListPageLayout, { AddButton } from "@rutba/pos-shared/components/ListPageLayout";
import ListPagination from "@rutba/pos-shared/components/ListPagination";
import ExcelIO from "../components/ExcelIO";
import { SEO_EXCEL_COLUMNS, SEO_POPULATE, makeSeoUpsert } from "../components/seoExcel";

const CATEGORY_EXCEL_COLUMNS = [
    { key: "name", isLabel: true, width: 32 },
    { key: "slug", width: 22 },
    { key: "summary", width: 60 },
    { key: "description", width: 90 },
    ...SEO_EXCEL_COLUMNS,
];

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200];

export default function Categories() {
    const { jwt } = useAuth();
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
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

    const allPageIds = categories.map(c => c.documentId);
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
            await CategoriesEndpoints.publish(docId);
            setCategories(prev => prev.map(c => c.documentId === docId ? { ...c, _isPublished: true } : c));
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
            await CategoriesEndpoints.unpublish(docId);
            setCategories(prev => prev.map(c => c.documentId === docId ? { ...c, _isPublished: false } : c));
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
        if (!confirm(`Publish ${ids.length} category(ies)?`)) return;
        let ok = 0, fail = 0;
        for (const docId of ids) {
            setPublishing(prev => ({ ...prev, [docId]: true }));
            try { await CategoriesEndpoints.publish(docId); ok++; setCategories(prev => prev.map(c => c.documentId === docId ? { ...c, _isPublished: true } : c)); }
            catch { fail++; }
            finally { setPublishing(prev => ({ ...prev, [docId]: false })); }
        }
        toast(`Published ${ok} category(ies)${fail ? `, ${fail} failed` : ""}.`, fail ? "warning" : "success");
        setSelectedIds(new Set());
    };

    const bulkUnpublish = async () => {
        const ids = [...selectedIds];
        if (ids.length === 0) { toast("No items selected.", "warning"); return; }
        if (!confirm(`Unpublish ${ids.length} category(ies)?`)) return;
        let ok = 0, fail = 0;
        for (const docId of ids) {
            setPublishing(prev => ({ ...prev, [docId]: true }));
            try { await CategoriesEndpoints.unpublish(docId); ok++; setCategories(prev => prev.map(c => c.documentId === docId ? { ...c, _isPublished: false } : c)); }
            catch { fail++; }
            finally { setPublishing(prev => ({ ...prev, [docId]: false })); }
        }
        toast(`Unpublished ${ok} category(ies)${fail ? `, ${fail} failed` : ""}.`, fail ? "warning" : "success");
        setSelectedIds(new Set());
    };

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const [draftRes, pubRes] = await Promise.all([
                CategoriesEndpoints.list({
                    sort: ["name:asc"],
                    populate: { logo: true, parent: true, ...SEO_POPULATE },
                    page,
                    pageSize,
                    ...(search.trim() ? { search: search.trim() } : {}),
                }),
                CategoriesEndpoints.listPublished({ pageSize: 500 }),
            ]);
            const pubIds = new Set((pubRes.data || []).map(c => c.documentId));
            setCategories((draftRes.data || []).map(c => ({ ...c, _isPublished: pubIds.has(c.documentId) })));
            setTotal(draftRes.meta?.pagination?.total ?? 0);
        } catch (err) {
            console.error("Failed to load categories", err);
        } finally {
            setLoading(false);
        }
    }, [jwt, search, page, pageSize]);

    useEffect(() => { load(); }, [load]);

    const fetchAllCategories = useCallback(async () => {
        const out = [];
        let p = 1;
        const PAGE = 100;
        while (true) {
            const res = await CategoriesEndpoints.list({
                sort: ["name:asc"],
                populate: { logo: true, parent: true, ...SEO_POPULATE },
                page: p,
                pageSize: PAGE,
                ...(search.trim() ? { search: search.trim() } : {}),
            });
            const arr = res.data || [];
            out.push(...arr);
            if (arr.length < PAGE) break;
            p += 1;
            if (p > 500) break;
        }
        return out;
    }, [search]);

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <ListPageLayout
                    title="Categories"
                    headerActions={
                        <>
                            <ExcelIO
                                entityLabel="Categories"
                                contentType="api::category.category"
                                columns={CATEGORY_EXCEL_COLUMNS}
                                rows={categories}
                                selectedIds={selectedIds}
                                total={total}
                                fetchAll={fetchAllCategories}
                                findExisting={async (row) => {
                                    if (!row.slug) return null;
                                    try {
                                        const res = await CategoriesEndpoints.listDraft({ pagination: { pageSize: 1 }, filters: { slug: { $eq: row.slug } }, populate: SEO_POPULATE });
                                        return res.data?.[0] || null;
                                    } catch { return null; }
                                }}
                                create={(data) => CategoriesEndpoints.create(data)}
                                update={(documentId, data) => CategoriesEndpoints.updateDraft(documentId, data)}
                                onSecondary={makeSeoUpsert("category", "category")}
                                onAfterImport={load}
                            />
                            <AddButton label="New Category" href="/new/category" />
                        </>
                    }
                    filters={[
                        <input
                            key="search"
                            type="text"
                            className="form-control form-control-sm"
                            placeholder="Search categories…"
                            value={search}
                            onChange={e => { setSearch(e.target.value); setPage(1); }}
                        />,
                    ]}
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
                    emptyState={<div>No categories found.</div>}
                >
                    {categories.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-hover list-table">
                            <thead>
                                <tr>
                                    <th style={{ width: 30 }}>
                                        <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} title="Select all" />
                                    </th>
                                    <th style={{ width: 50 }}></th>
                                    <th>Name</th>
                                    <th>Slug</th>
                                    <th>Parent</th>
                                    <th>Published</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {categories.map(c => (
                                    <tr key={c.id}>
                                        <td>
                                            <input type="checkbox" checked={selectedIds.has(c.documentId)} onChange={() => toggleSelected(c.documentId)} />
                                        </td>
                                        <td>
                                            {c.logo?.url ? (
                                                <img src={MediaUtilsEndpoints.strapiImageUrl(c.logo)} alt={c.name} style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 4 }} />
                                            ) : (
                                                <span className="text-muted"><i className="fas fa-folder"></i></span>
                                            )}
                                        </td>
                                        <td>{c.name}</td>
                                        <td><code>{c.slug}</code></td>
                                        <td>{c.parent?.name || "—"}</td>
                                        <td>
                                            {c._isPublished
                                                ? <button className="list-status btn border-0" style={{ background: '#198754', color: '#fff' }} onClick={() => unpublishOne(c.documentId)} disabled={publishing[c.documentId]} title="Click to unpublish">
                                                    {publishing[c.documentId] ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-check me-1"></i>Published</>}
                                                </button>
                                                : <button className="list-status btn border-0" style={{ background: '#e9ecef', color: '#495057' }} onClick={() => publishOne(c.documentId)} disabled={publishing[c.documentId]} title="Click to publish">
                                                    {publishing[c.documentId] ? <i className="fas fa-spinner fa-spin"></i> : "Draft"}
                                                </button>
                                            }
                                        </td>
                                        <td>
                                            <div className="list-actions">
                                                <Link className="btn btn-outline-primary" href={`/${c.documentId}/category`}>
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

