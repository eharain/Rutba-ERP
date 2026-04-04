import { useState, useEffect, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";
import Link from "next/link";
import { useToast } from "../components/Toast";

const PAGE_TYPES = ["page", "blog", "announcement"];

const PAGE_EXPORT_COLUMNS = ["slug", "title", "excerpt", "content", "page_type", "sort_order"];

function exportPagesToExcel(pages) {
    const rows = pages.map(p => ({
        slug: p.slug || "",
        title: p.title || "",
        excerpt: p.excerpt || "",
        content: p.content || "",
        page_type: p.page_type || "page",
        sort_order: p.sort_order ?? 0,
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows, { header: PAGE_EXPORT_COLUMNS });
    ws["!cols"] = [
        { wch: 22 }, { wch: 45 }, { wch: 80 }, { wch: 120 }, { wch: 14 }, { wch: 12 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, "CMS Pages");
    XLSX.writeFile(wb, `cms-pages-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function parsePageExcel(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const wb = XLSX.read(e.target.result, { type: "array" });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const jsonRows = XLSX.utils.sheet_to_json(ws, { defval: "" });
                if (!jsonRows || jsonRows.length === 0) return resolve([]);
                const mapped = jsonRows.map((row) => ({
                    slug: String(row.slug || row.Slug || "").trim(),
                    title: String(row.title || row.Title || "").trim(),
                    excerpt: String(row.excerpt || row.Excerpt || "").trim(),
                    content: String(row.content || row.Content || "").trim(),
                    page_type: String(row.page_type || row["Page Type"] || "page").trim(),
                    sort_order: parseInt(row.sort_order ?? row["Sort Order"] ?? 0, 10) || 0,
                })).filter(r => r.slug && r.title);
                resolve(mapped);
            } catch (err) { reject(err); }
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsArrayBuffer(file);
    });
}

function getTypeBadgeClass(type) {
    switch (type) {
        case "blog": return "bg-info";
        case "announcement": return "bg-warning text-dark";
        case "page": return "bg-primary";
        default: return "bg-secondary";
    }
}

export default function Pages() {
    const { jwt } = useAuth();
    const [pages, setPages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [typeFilter, setTypeFilter] = useState("");
    const [importing, setImporting] = useState(false);
    const [importLog, setImportLog] = useState([]);
    const [error, setError] = useState("");
    const importRef = useRef(null);
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
            await authApi.post(`/cms-pages/${docId}/publish`, {});
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
            await authApi.post(`/cms-pages/${docId}/unpublish`, {});
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
            try { await authApi.post(`/cms-pages/${docId}/publish`, {}); ok++; setPages(prev => prev.map(p => p.documentId === docId ? { ...p, _isPublished: true } : p)); }
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
            try { await authApi.post(`/cms-pages/${docId}/unpublish`, {}); ok++; setPages(prev => prev.map(p => p.documentId === docId ? { ...p, _isPublished: false } : p)); }
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
            const params = {
                status: 'draft',
                sort: ["sort_order:asc", "createdAt:desc"],
                populate: ["featured_image"],
                pagination: { pageSize: 50 },
            };
            const filters = {};
            if (search.trim()) filters.title = { $containsi: search.trim() };
            if (typeFilter) filters.page_type = { $eq: typeFilter };
            if (Object.keys(filters).length > 0) params.filters = filters;

            const [draftRes, pubRes] = await Promise.all([
                authApi.get("/cms-pages", params),
                authApi.get("/cms-pages", { status: 'published', fields: ["documentId"], pagination: { pageSize: 200 } }),
            ]);
            const pubIds = new Set((pubRes.data || []).map(p => p.documentId));
            setPages((draftRes.data || []).map(p => ({ ...p, _isPublished: pubIds.has(p.documentId) })));
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
    }, [jwt, search, typeFilter]);

    useEffect(() => { load(); }, [load]);

    async function handleImport(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        setImporting(true);
        setImportLog([]);
        try {
            const rows = await parsePageExcel(file);
            if (rows.length === 0) {
                setImportLog([{ type: "warning", text: "No valid rows found. Ensure columns: slug, title" }]);
                return;
            }
            const log = [];
            for (const row of rows) {
                try {
                    const existing = await authApi.get("/cms-pages", {
                        status: "draft",
                        filters: { slug: { $eq: row.slug } },
                        fields: ["documentId"],
                        pagination: { pageSize: 1 },
                    });
                    const doc = existing.data?.[0];
                    if (doc) {
                        await authApi.put(`/cms-pages/${doc.documentId}`, { data: row });
                        log.push({ type: "success", text: `Updated: ${row.slug}` });
                    } else {
                        await authApi.post("/cms-pages", { data: row });
                        log.push({ type: "success", text: `Created: ${row.slug}` });
                    }
                } catch (err) {
                    const detail = err?.response?.data?.error?.message || err.message || "Unknown error";
                    log.push({ type: "danger", text: `Failed: ${row.slug} – ${detail}` });
                }
            }
            setImportLog(log);
            await load();
        } catch (err) {
            setImportLog([{ type: "danger", text: "Failed to parse file: " + (err.message || "Unknown error") }]);
        } finally {
            setImporting(false);
            if (importRef.current) importRef.current.value = "";
        }
    }

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <div className="d-flex align-items-center justify-content-between mb-3">
                    <h2 className="mb-0">Pages</h2>
                    <div className="d-flex gap-2">
                        {selectedIds.size > 0 && (
                            <>
                                <span className="badge bg-primary align-self-center">{selectedIds.size} selected</span>
                                <button className="btn btn-sm btn-success" onClick={bulkPublish}>
                                    <i className="fas fa-upload me-1"></i>Publish
                                </button>
                                <button className="btn btn-sm btn-outline-secondary" onClick={bulkUnpublish}>
                                    <i className="fas fa-eye-slash me-1"></i>Unpublish
                                </button>
                            </>
                        )}
                        <button
                            className="btn btn-outline-success btn-sm"
                            disabled={pages.length === 0}
                            onClick={() => exportPagesToExcel(pages)}
                        >
                            <i className="fas fa-file-excel me-1"></i>Export Excel
                        </button>
                        <label className={`btn btn-outline-info btn-sm mb-0${importing ? " disabled" : ""}`}>
                            <i className="fas fa-upload me-1"></i>{importing ? "Importing…" : "Import Excel"}
                            <input
                                ref={importRef}
                                type="file"
                                accept=".xlsx,.xls,.csv"
                                className="d-none"
                                disabled={importing}
                                onChange={handleImport}
                            />
                        </label>
                        <Link className="btn btn-primary btn-sm" href="/new/cms-page">
                            <i className="fas fa-plus me-1"></i>New Page
                        </Link>
                    </div>
                </div>

                {importLog.length > 0 && (
                    <div className="mb-3">
                        {importLog.map((l, i) => (
                            <div key={i} className={`alert alert-${l.type} py-1 px-2 mb-1 small`}>{l.text}</div>
                        ))}
                    </div>
                )}

                <div className="row g-2 mb-3">
                    <div className="col-md-4">
                        <input
                            type="text"
                            className="form-control form-control-sm"
                            placeholder="Search pages…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    <div className="col-auto">
                        <select className="form-select form-select-sm" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                            <option value="">All types</option>
                            {PAGE_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                        </select>
                    </div>
                </div>

                {loading && <p>Loading pages...</p>}

                {!loading && error && (
                    <div className="alert alert-danger"><i className="fas fa-exclamation-triangle me-2"></i>{error}</div>
                )}

                {!loading && !error && pages.length === 0 && (
                    <div className="alert alert-info">No pages found. Create your first page!</div>
                )}

                {!loading && pages.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
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
                                        <td><span className={`badge ${getTypeBadgeClass(p.page_type)}`}>{p.page_type}</span></td>
                                        <td>{p.sort_order}</td>
                                        <td>
                                            {p._isPublished
                                                ? <button className="btn btn-sm btn-success py-0 px-1" onClick={() => unpublishOne(p.documentId)} disabled={publishing[p.documentId]} title="Click to unpublish">
                                                    {publishing[p.documentId] ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-check me-1"></i>Published</>}
                                                </button>
                                                : <button className="btn btn-sm btn-outline-secondary py-0 px-1" onClick={() => publishOne(p.documentId)} disabled={publishing[p.documentId]} title="Click to publish">
                                                    {publishing[p.documentId] ? <i className="fas fa-spinner fa-spin"></i> : "Draft"}
                                                </button>
                                            }
                                        </td>
                                        <td>
                                            <Link className="btn btn-sm btn-outline-primary" href={`/${p.documentId}/cms-page`}>
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

