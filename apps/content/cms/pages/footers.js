import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { CmsFootersEndpoints } from "@rutba/api-provider/endpoints";
import Link from "next/link";
import { useToast } from "../components/Toast";
import ListPageLayout, { AddButton } from "@rutba/pos-shared/components/ListPageLayout";
import ListPagination from "@rutba/pos-shared/components/ListPagination";
import ExcelIO from "../components/ExcelIO";

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200];

const tryParseJSON = (val) => {
    if (val === null || val === undefined || val === "") return undefined;
    if (typeof val !== "string") return val;
    try { return JSON.parse(val); } catch { return val; }
};

const FOOTER_EXCEL_COLUMNS = [
    { key: "slug", isLabel: true, width: 18 },
    { key: "name", width: 28 },
    { key: "phone", width: 20 },
    { key: "email", width: 22 },
    { key: "address", width: 60 },
    { key: "opening_hours", width: 60, format: (r) => r.opening_hours ? JSON.stringify(r.opening_hours) : "", parse: tryParseJSON },
    { key: "social_links", width: 60, format: (r) => r.social_links ? JSON.stringify(r.social_links) : "", parse: tryParseJSON },
    { key: "copyright_text", width: 45 },
];

export default function Footers() {
    const { jwt } = useAuth();
    const [footers, setFooters] = useState([]);
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

    const allPageIds = footers.map(f => f.documentId);
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
            await CmsFootersEndpoints.publish(docId);
            setFooters(prev => prev.map(f => f.documentId === docId ? { ...f, _isPublished: true } : f));
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
            await CmsFootersEndpoints.unpublish(docId);
            setFooters(prev => prev.map(f => f.documentId === docId ? { ...f, _isPublished: false } : f));
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
        if (!confirm(`Publish ${ids.length} footer(s)?`)) return;
        let ok = 0, fail = 0;
        for (const docId of ids) {
            setPublishing(prev => ({ ...prev, [docId]: true }));
            try { await CmsFootersEndpoints.publish(docId); ok++; setFooters(prev => prev.map(f => f.documentId === docId ? { ...f, _isPublished: true } : f)); }
            catch { fail++; }
            finally { setPublishing(prev => ({ ...prev, [docId]: false })); }
        }
        toast(`Published ${ok} footer(s)${fail ? `, ${fail} failed` : ""}.`, fail ? "warning" : "success");
        setSelectedIds(new Set());
    };

    const bulkUnpublish = async () => {
        const ids = [...selectedIds];
        if (ids.length === 0) { toast("No items selected.", "warning"); return; }
        if (!confirm(`Unpublish ${ids.length} footer(s)?`)) return;
        let ok = 0, fail = 0;
        for (const docId of ids) {
            setPublishing(prev => ({ ...prev, [docId]: true }));
            try { await CmsFootersEndpoints.unpublish(docId); ok++; setFooters(prev => prev.map(f => f.documentId === docId ? { ...f, _isPublished: false } : f)); }
            catch { fail++; }
            finally { setPublishing(prev => ({ ...prev, [docId]: false })); }
        }
        toast(`Unpublished ${ok} footer(s)${fail ? `, ${fail} failed` : ""}.`, fail ? "warning" : "success");
        setSelectedIds(new Set());
    };

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const [draftRes, pubRes] = await Promise.all([
                CmsFootersEndpoints.listDraft({ sort: ["createdAt:desc"], page, pageSize }),
                CmsFootersEndpoints.listPublished({ pageSize: 200 }),
            ]);
            const pubIds = new Set((pubRes.data || []).map(f => f.documentId));
            setFooters((draftRes.data || []).map(f => ({ ...f, _isPublished: pubIds.has(f.documentId) })));
            setTotal(draftRes.meta?.pagination?.total ?? 0);
        } catch (err) {
            console.error("Failed to load footers", err);
        } finally {
            setLoading(false);
        }
    }, [jwt, page, pageSize]);

    useEffect(() => { load(); }, [load]);

    const fetchAllFooters = useCallback(async () => {
        const out = [];
        let p = 1;
        const PAGE = 100;
        while (true) {
            const res = await CmsFootersEndpoints.listDraft({ sort: ["createdAt:desc"], page: p, pageSize: PAGE });
            const arr = res.data || [];
            out.push(...arr);
            if (arr.length < PAGE) break;
            p += 1;
            if (p > 500) break;
        }
        return out;
    }, []);

    const findExistingFooter = useCallback(async (row) => {
        if (!row.slug) return null;
        try {
            const res = await CmsFootersEndpoints.listDraft({
                pagination: { pageSize: 1 },
                filters: { slug: { $eq: row.slug } },
            });
            return res.data?.[0] || null;
        } catch { return null; }
    }, []);

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <ListPageLayout
                    title="Footers"
                    subtitle="Footer configurations contain contact info, opening hours, social links and pinned page links. Attach a footer to a CMS page to display it on the website."
                    headerActions={
                        <>
                            <ExcelIO
                                entityLabel="CMS Footers"
                                contentType="api::cms-footer.cms-footer"
                                columns={FOOTER_EXCEL_COLUMNS}
                                rows={footers}
                                selectedIds={selectedIds}
                                total={total}
                                fetchAll={fetchAllFooters}
                                findExisting={findExistingFooter}
                                create={(data) => CmsFootersEndpoints.create(data)}
                                update={(documentId, data) => CmsFootersEndpoints.updateDraft(documentId, data)}
                                onAfterImport={load}
                            />
                            <AddButton label="New Footer" href="/new/cms-footer" />
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
                    emptyState={<div>No footers found.</div>}
                >
                    {footers.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-hover list-table">
                            <thead>
                                <tr>
                                    <th style={{ width: 30 }}>
                                        <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} title="Select all" />
                                    </th>
                                    <th>Name</th>
                                    <th>Slug</th>
                                    <th>Phone</th>
                                    <th>Published</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {footers.map(f => (
                                    <tr key={f.id}>
                                        <td>
                                            <input type="checkbox" checked={selectedIds.has(f.documentId)} onChange={() => toggleSelected(f.documentId)} />
                                        </td>
                                        <td>{f.name}</td>
                                        <td><code>{f.slug}</code></td>
                                        <td>{f.phone || "—"}</td>
                                        <td>
                                            {f._isPublished
                                                ? <button className="list-status btn border-0" style={{ background: '#198754', color: '#fff' }} onClick={() => unpublishOne(f.documentId)} disabled={publishing[f.documentId]} title="Click to unpublish">
                                                    {publishing[f.documentId] ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-check me-1"></i>Published</>}
                                                </button>
                                                : <button className="list-status btn border-0" style={{ background: '#e9ecef', color: '#495057' }} onClick={() => publishOne(f.documentId)} disabled={publishing[f.documentId]} title="Click to publish">
                                                    {publishing[f.documentId] ? <i className="fas fa-spinner fa-spin"></i> : "Draft"}
                                                </button>
                                            }
                                        </td>
                                        <td>
                                            <div className="list-actions">
                                                <Link className="btn btn-outline-primary" href={`/${f.documentId}/cms-footer`}>
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

