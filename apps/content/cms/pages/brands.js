import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { BrandsEndpoints, MediaUtilsEndpoints } from "@rutba/api-provider/endpoints";
import Link from "next/link";
import { useToast } from "../components/Toast";
import ListPageLayout, { AddButton } from "@rutba/pos-shared/components/ListPageLayout";
import ListPagination from "@rutba/pos-shared/components/ListPagination";
import ExcelIO from "../components/ExcelIO";
import { SEO_EXCEL_COLUMNS, SEO_POPULATE, makeSeoUpsert } from "../components/seoExcel";
import { buildBrandWebUrl } from "../lib/cmsPageWebUrl";

const BRAND_EXCEL_COLUMNS = [
    { key: "name", isLabel: true, width: 32 },
    { key: "slug", width: 22 },
    { key: "summary", width: 60 },
    { key: "description", width: 90 },
    ...SEO_EXCEL_COLUMNS,
];

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200];

export default function Brands() {
    const { jwt } = useAuth();
    const [brands, setBrands] = useState([]);
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
            await BrandsEndpoints.publish(docId);
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
            await BrandsEndpoints.unpublish(docId);
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
            try { await BrandsEndpoints.publish(docId); ok++; setBrands(prev => prev.map(b => b.documentId === docId ? { ...b, _isPublished: true } : b)); }
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
            try { await BrandsEndpoints.unpublish(docId); ok++; setBrands(prev => prev.map(b => b.documentId === docId ? { ...b, _isPublished: false } : b)); }
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
            const [draftRes, pubRes] = await Promise.all([
                BrandsEndpoints.list({ search: search.trim() || undefined, populate: { logo: true, ...SEO_POPULATE }, page, pageSize }),
                BrandsEndpoints.listPublished(),
            ]);
            const pubIds = new Set((pubRes.data || []).map(b => b.documentId));
            setBrands((draftRes.data || []).map(b => ({ ...b, _isPublished: pubIds.has(b.documentId) })));
            setTotal(draftRes.meta?.pagination?.total ?? 0);
        } catch (err) {
            console.error("Failed to load brands", err);
        } finally {
            setLoading(false);
        }
    }, [jwt, search, page, pageSize]);

    useEffect(() => { load(); }, [load]);

    const fetchAllBrands = useCallback(async () => {
        const out = [];
        let p = 1;
        const PAGE = 100;
        while (true) {
            const res = await BrandsEndpoints.list({
                search: search.trim() || undefined,
                populate: { logo: true, ...SEO_POPULATE },
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
    }, [search]);

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <ListPageLayout
                    title="Brands"
                    headerActions={
                        <>
                            <ExcelIO
                                entityLabel="Brands"
                                contentType="api::brand.brand"
                                columns={BRAND_EXCEL_COLUMNS}
                                rows={brands}
                                selectedIds={selectedIds}
                                total={total}
                                fetchAll={fetchAllBrands}
                                findExisting={async (row) => {
                                    if (!row.slug) return null;
                                    try {
                                        const res = await BrandsEndpoints.listDraft({ pagination: { pageSize: 1 }, filters: { slug: { $eq: row.slug } }, populate: SEO_POPULATE });
                                        return res.data?.[0] || null;
                                    } catch { return null; }
                                }}
                                create={(data) => BrandsEndpoints.create(data)}
                                update={(documentId, data) => BrandsEndpoints.updateDraft(documentId, data)}
                                onSecondary={makeSeoUpsert("brand", "brand")}
                                onAfterImport={load}
                            />
                            <AddButton label="New Brand" href="/new/brand" />
                        </>
                    }
                    filters={[
                        <input
                            key="search"
                            type="text"
                            className="form-control form-control-sm"
                            placeholder="Search brands…"
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
                    emptyState={<div>No brands found.</div>}
                >
                    {brands.length > 0 && (
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
                                                <img src={MediaUtilsEndpoints.strapiImageUrl(b.logo)} alt={b.name} style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 4 }} />
                                            ) : (
                                                <span className="text-muted"><i className="fas fa-copyright"></i></span>
                                            )}
                                        </td>
                                        <td>{b.name}</td>
                                        <td><code>{b.slug}</code></td>
                                        <td>
                                            {b._isPublished
                                                ? <button className="list-status btn border-0" style={{ background: '#198754', color: '#fff' }} onClick={() => unpublishOne(b.documentId)} disabled={publishing[b.documentId]} title="Click to unpublish">
                                                    {publishing[b.documentId] ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-check me-1"></i>Published</>}
                                                </button>
                                                : <button className="list-status btn border-0" style={{ background: '#e9ecef', color: '#495057' }} onClick={() => publishOne(b.documentId)} disabled={publishing[b.documentId]} title="Click to publish">
                                                    {publishing[b.documentId] ? <i className="fas fa-spinner fa-spin"></i> : "Draft"}
                                                </button>
                                            }
                                        </td>
                                        <td>
                                            <div className="list-actions">
                                                <Link className="btn btn-outline-primary" href={`/${b.documentId}/brand`}>
                                                    Edit
                                                </Link>
                                                {buildBrandWebUrl(b) && (
                                                    <a
                                                        className="btn btn-outline-secondary"
                                                        href={buildBrandWebUrl(b)}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        title="Open brand filter on the storefront"
                                                    >
                                                        <i className="fas fa-eye me-1"></i>View
                                                    </a>
                                                )}
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


