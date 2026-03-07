import { useState, useEffect, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";
import Link from "next/link";

const FOOTER_EXPORT_COLUMNS = ["slug", "name", "phone", "email", "address", "opening_hours", "social_links", "copyright_text"];

function exportFootersToExcel(footers) {
    const rows = footers.map(f => ({
        slug: f.slug || "",
        name: f.name || "",
        phone: f.phone || "",
        email: f.email || "",
        address: f.address || "",
        opening_hours: f.opening_hours ? JSON.stringify(f.opening_hours) : "",
        social_links: f.social_links ? JSON.stringify(f.social_links) : "",
        copyright_text: f.copyright_text || "",
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows, { header: FOOTER_EXPORT_COLUMNS });
    ws["!cols"] = [
        { wch: 18 }, { wch: 28 }, { wch: 20 }, { wch: 22 },
        { wch: 60 }, { wch: 60 }, { wch: 60 }, { wch: 45 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, "CMS Footers");
    XLSX.writeFile(wb, `cms-footers-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function tryParseJSON(val) {
    if (!val || typeof val !== "string") return val;
    try { return JSON.parse(val); } catch { return val; }
}

function parseFooterExcel(file) {
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
                    name: String(row.name || row.Name || "").trim(),
                    phone: String(row.phone || row.Phone || "").trim(),
                    email: String(row.email || row.Email || "").trim(),
                    address: String(row.address || row.Address || "").trim(),
                    opening_hours: tryParseJSON(row.opening_hours || row["Opening Hours"] || ""),
                    social_links: tryParseJSON(row.social_links || row["Social Links"] || ""),
                    copyright_text: String(row.copyright_text || row["Copyright Text"] || "").trim(),
                })).filter(r => r.slug && r.name);
                resolve(mapped);
            } catch (err) { reject(err); }
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsArrayBuffer(file);
    });
}

export default function Footers() {
    const { jwt } = useAuth();
    const [footers, setFooters] = useState([]);
    const [loading, setLoading] = useState(true);
    const [importing, setImporting] = useState(false);
    const [importLog, setImportLog] = useState([]);
    const importRef = useRef(null);

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const [draftRes, pubRes] = await Promise.all([
                authApi.get("/cms-footers", {
                    status: 'draft',
                    sort: ["createdAt:desc"],
                    pagination: { pageSize: 50 },
                }),
                authApi.get("/cms-footers", { status: 'published', fields: ["documentId"], pagination: { pageSize: 200 } }),
            ]);
            const pubIds = new Set((pubRes.data || []).map(f => f.documentId));
            setFooters((draftRes.data || []).map(f => ({ ...f, _isPublished: pubIds.has(f.documentId) })));
        } catch (err) {
            console.error("Failed to load footers", err);
        } finally {
            setLoading(false);
        }
    }, [jwt]);

    useEffect(() => { load(); }, [load]);

    async function handleImport(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        setImporting(true);
        setImportLog([]);
        try {
            const rows = await parseFooterExcel(file);
            if (rows.length === 0) {
                setImportLog([{ type: "warning", text: "No valid rows found. Ensure columns: slug, name" }]);
                return;
            }
            const log = [];
            for (const row of rows) {
                try {
                    const existing = await authApi.get("/cms-footers", {
                        status: "draft",
                        filters: { slug: { $eq: row.slug } },
                        fields: ["documentId"],
                        pagination: { pageSize: 1 },
                    });
                    const doc = existing.data?.[0];
                    if (doc) {
                        await authApi.put(`/cms-footers/${doc.documentId}`, { data: row });
                        log.push({ type: "success", text: `Updated: ${row.slug}` });
                    } else {
                        await authApi.post("/cms-footers", { data: row });
                        log.push({ type: "success", text: `Created: ${row.slug}` });
                    }
                } catch (err) {
                    log.push({ type: "danger", text: `Failed: ${row.slug} – ${err.message || "Unknown error"}` });
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
                <div className="d-flex align-items-center justify-content-between mb-3">
                    <h2 className="mb-0">Footers</h2>
                    <div className="d-flex gap-2">
                        <button
                            className="btn btn-outline-success btn-sm"
                            disabled={footers.length === 0}
                            onClick={() => exportFootersToExcel(footers)}
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
                        <Link className="btn btn-primary btn-sm" href="/new/cms-footer">
                            <i className="fas fa-plus me-1"></i>New Footer
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

                <p className="text-muted small mb-3">
                    Footer configurations contain contact info, opening hours, social links and pinned page links. Attach a footer to a CMS page to display it on the website.
                </p>

                {loading && <p>Loading footers...</p>}
                {!loading && footers.length === 0 && <div className="alert alert-info">No footers found.</div>}

                {!loading && footers.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr>
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
                                        <td>{f.name}</td>
                                        <td><code>{f.slug}</code></td>
                                        <td>{f.phone || "—"}</td>
                                        <td>
                                            {f._isPublished
                                                ? <span className="badge bg-success">Published</span>
                                                : <span className="badge bg-secondary">Draft</span>
                                            }
                                        </td>
                                        <td>
                                            <Link className="btn btn-sm btn-outline-primary" href={`/${f.documentId}/cms-footer`}>
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

export async function getServerSideProps() { return { props: {} }; }
