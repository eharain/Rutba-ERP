import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { CmsPagesEndpoints } from "@rutba/api-provider/endpoints";
import Link from "next/link";
import { useToast } from "../components/Toast";
import EnumSelect from "../components/EnumSelect";
import ListPageLayout, { AddButton } from "@rutba/pos-shared/components/ListPageLayout";
import ListPagination from "@rutba/pos-shared/components/ListPagination";
import ExcelIO from "../components/ExcelIO";
import { SEO_EXCEL_COLUMNS, SEO_POPULATE, makeSeoUpsert } from "../components/seoExcel";

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200];

const PAGE_EXCEL_COLUMNS = [
    { key: "slug", isLabel: true, width: 22 },
    { key: "title", width: 45 },
    { key: "excerpt", width: 80 },
    { key: "content", width: 120 },
    { key: "page_type", width: 14, parse: (v) => String(v || "shop").trim() },
    ...SEO_EXCEL_COLUMNS,
];

function getTypeBadgeClass(type) {
    switch (type) {
        case "shop": return "bg-primary";
        case "blog": return "bg-success";
        case "news": return "bg-danger";
        case "info": return "bg-info";
        default: return "bg-secondary";
    }
}

function getTypeStatusStyle(type) {
    switch (type) {
        case "shop": return { background: "#0d6efd", color: "#fff" };
        case "blog": return { background: "#198754", color: "#fff" };
        case "news": return { background: "#dc3545", color: "#fff" };
        case "info": return { background: "#0dcaf0", color: "#212529" };
        default: return { background: "#6c757d", color: "#fff" };
    }
}

export default function Pages() {
    const { jwt } = useAuth();
    const [pages, setPages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [typeFilter, setTypeFilter] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
    const [total, setTotal] = useState(0);
    const [error, setError] = useState("");
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

    const allPageIds = pages.map(p => p.documentId);
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
            await CmsPagesEndpoints.publish(docId);
            setPages(prev => prev.map(p => p.documentId === docId ? { ...p, _isPublished: true } : p));
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
            //:todo: bad pattern to have separate publish and unpublish endpoints, should we just have a single /cms-pages/:id/publish endpoint that toggles state based on current value to avoid this?
            await CmsPagesEndpoints.unpublish(docId);
            setPages(prev => prev.map(p => p.documentId === docId ? { ...p, _isPublished: false } : p));
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
        if (!confirm(`Publish ${ids.length} page(s)?`)) return;
        let ok = 0, fail = 0;
        for (const docId of ids) {
            setPublishing(prev => ({ ...prev, [docId]: true }));
            try {
                //todo: bad pattern to have separate publish and unpublish endpoints, should we just have a single /cms-pages/:id/publish endpoint that toggles state based on current value to avoid this?
                await CmsPagesEndpoints.publish(docId);
                ok++;
                setPages(prev => prev.map(p => p.documentId === docId ? { ...p, _isPublished: true } : p));
            }
            catch { fail++; }
            finally { setPublishing(prev => ({ ...prev, [docId]: false })); }
        }
        toast(`Published ${ok} page(s)${fail ? `, ${fail} failed` : ""}.`, fail ? "warning" : "success");
        setSelectedIds(new Set());
    };

    const bulkUnpublish = async () => {
        const ids = [...selectedIds];
        if (ids.length === 0) { toast("No items selected.", "warning"); return; }
        if (!confirm(`Unpublish ${ids.length} page(s)?`)) return;
        let ok = 0, fail = 0;
        for (const docId of ids) {
            setPublishing(prev => ({ ...prev, [docId]: true }));
            try {
                //:todo: bad pattern to have separate publish and unpublish endpoints, should we just have a single /cms-pages/:id/publish endpoint that toggles state based on current value to avoid this?
                await CmsPagesEndpoints.unpublish(docId); ok++; 
                
                setPages(prev => prev.map(p => p.documentId === docId ? { ...p, _isPublished: false } : p)); }
            catch { fail++; }
            finally { setPublishing(prev => ({ ...prev, [docId]: false })); }
        }
        toast(`Unpublished ${ok} page(s)${fail ? `, ${fail} failed` : ""}.`, fail ? "warning" : "success");
        setSelectedIds(new Set());
    };

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        setError("");
        try {
            //todo : bad pattern to have to make 2 calls to determine publication state, should we add a /pages-with-publish-state endpoint in the api that returns all pages with a boolean is_published field to avoid this?
            const [draftRes, pubRes] = await Promise.all([
                CmsPagesEndpoints.listDraft({ search: search.trim() || undefined, typeFilter: typeFilter || undefined, page, pageSize, populate: { featured_image: true, ...SEO_POPULATE } }),
                CmsPagesEndpoints.listPublished({ pageSize: 200 }),
            ]);
            const pubIds = new Set((pubRes.data || []).map(p => p.documentId));
            setPages((draftRes.data || []).map(p => ({ ...p, _isPublished: pubIds.has(p.documentId) })));
            setTotal(draftRes.meta?.pagination?.total ?? 0);
        } catch (err) {
            console.error("Failed to load pages", err);
            const serverMsg = err?.response?.data?.error?.message;
            const status = err?.response?.status;
            if (status === 403) {
                setError(serverMsg || "You do not have permission to access CMS pages. Ensure your account has the 'cms' app access.");
            } else {
                setError(serverMsg || err.message || "Failed to load pages");
            }
        } finally {
            setLoading(false);
        }
    }, [jwt, search, typeFilter, page, pageSize]);

    useEffect(() => { load(); }, [load]);

    const fetchAllPages = useCallback(async () => {
        const out = [];
        let p = 1;
        const PAGE = 100;
        while (true) {
            const res = await CmsPagesEndpoints.listDraft({
                search: search.trim() || undefined,
                typeFilter: typeFilter || undefined,
                page: p,
                pageSize: PAGE,
                populate: { featured_image: true, ...SEO_POPULATE },
            });
            const arr = res.data || [];
            out.push(...arr);
            if (arr.length < PAGE) break;
            p += 1;
            if (p > 500) break;
        }
        return out;
    }, [search, typeFilter]);

    const findExistingPage = useCallback(async (row) => {
        if (!row.slug) return null;
        try {
            const res = await CmsPagesEndpoints.listDraft({
                pageSize: 1,
                filters: { slug: { $eq: row.slug } },
                populate: SEO_POPULATE,
            });
            return res.data?.[0] || null;
        } catch { return null; }
    }, []);

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <ListPageLayout
                    title="Pages"
                    headerActions={
                        <>
                            <ExcelIO
                                entityLabel="CMS Pages"
                                contentType="api::cms-page.cms-page"
                                columns={PAGE_EXCEL_COLUMNS}
                                rows={pages}
                                selectedIds={selectedIds}
                                total={total}
                                fetchAll={fetchAllPages}
                                findExisting={findExistingPage}
                                create={(data) => CmsPagesEndpoints.create(data)}
                                update={(documentId, data) => CmsPagesEndpoints.update(documentId, data)}
                                onSecondary={makeSeoUpsert("cms_page", "cms-page")}
                                onAfterImport={load}
                            />
                            <AddButton label="New Page" href="/new/cms-page" />
                        </>
                    }
                    filters={[
                        <input
                            key="search"
                            type="text"
                            className="form-control form-control-sm"
                            placeholder="Search pages…"
                            value={search}
                            onChange={e => { setSearch(e.target.value); setPage(1); }}
                        />,
                        <EnumSelect
                            key="type"
                            name="cms-page"
                            field="page_type"
                            className="form-select form-select-sm"
                            value={typeFilter}
                            onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
                            includeBlank="All types"
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
                    emptyState={<div>{error ? error : "No pages found. Create your first page!"}</div>}
                >
                    {error && (
                        <div className="p-3"><div className="alert alert-danger mb-0"><i className="fas fa-exclamation-triangle me-2"></i>{error}</div></div>
                    )}
                    {!error && pages.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-hover list-table">
                            <thead>
                                <tr>
                                    <th style={{ width: 30 }}>
                                        <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} title="Select all" />
                                    </th>
                                    <th>Title</th>
                                    <th>Slug</th>
                                    <th>Type</th>
                                    <th>Order</th>
                                    <th>Published</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {pages.map(p => (
                                    <tr key={p.id}>
                                        <td>
                                            <input type="checkbox" checked={selectedIds.has(p.documentId)} onChange={() => toggleSelected(p.documentId)} />
                                        </td>
                                        <td>{p.title}</td>
                                        <td><code>{p.slug}</code></td>
                                        <td><span className="list-status" style={getTypeStatusStyle(p.page_type)}>{p.page_type}</span></td>
                                        <td>{p.sort_order}</td>
                                        <td>
                                            {p._isPublished
                                                ? <button className="list-status btn border-0" style={{ background: '#198754', color: '#fff' }} onClick={() => unpublishOne(p.documentId)} disabled={publishing[p.documentId]} title="Click to unpublish">
                                                    {publishing[p.documentId] ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-check me-1"></i>Published</>}
                                                </button>
                                                : <button className="list-status btn border-0" style={{ background: '#e9ecef', color: '#495057' }} onClick={() => publishOne(p.documentId)} disabled={publishing[p.documentId]} title="Click to publish">
                                                    {publishing[p.documentId] ? <i className="fas fa-spinner fa-spin"></i> : "Draft"}
                                                </button>
                                            }
                                        </td>
                                        <td>
                                            <div className="list-actions">
                                                <Link className="btn btn-outline-primary" href={`/${p.documentId}/cms-page`}>
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


