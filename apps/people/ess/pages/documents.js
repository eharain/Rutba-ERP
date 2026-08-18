import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/shared/components/ProtectedRoute";
import { useAuth } from "@rutba/shared/context/AuthContext";
import { HrGeneratedDocumentsEndpoints, HrComplianceItemsEndpoints } from "@rutba/api-provider/endpoints";

const COMPLIANCE_VARIANT = { Valid: "success", ExpiringSoon: "warning", Expired: "danger", Waived: "secondary" };

function fmt(d) {
    return d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";
}

function daysUntil(d) {
    if (!d) return null;
    return Math.ceil((new Date(d) - new Date()) / 86400000);
}

/**
 * Letters print client-side (React + window.print()) rather than via a server
 * PDF renderer — same convention the label printing already follows.
 */
function printLetter(doc) {
    const win = window.open("", "_blank", "width=800,height=900");
    if (!win) return alert("Please allow pop-ups to print this document.");
    const esc = (s) => String(s || "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
    win.document.write(`<!doctype html><html><head><title>${esc(doc.subject || doc.type)}</title>
<style>
  body{font-family:Georgia,'Times New Roman',serif;line-height:1.7;margin:48px;color:#111}
  h1{font-size:18px;margin:0 0 4px}
  .ref{color:#666;font-size:12px;margin-bottom:28px}
  .body{white-space:pre-wrap;font-size:14px}
  @media print{body{margin:24mm}}
</style></head><body>
<h1>${esc(doc.subject || doc.type)}</h1>
<div class="ref">Ref: ${esc(doc.reference_no)} &middot; ${esc(fmt(doc.generated_at))}</div>
<div class="body">${esc(doc.content)}</div>
</body></html>`);
    win.document.close();
    win.focus();
    win.print();
}

export default function Documents() {
    const { jwt } = useAuth();
    const [docs, setDocs] = useState([]);
    const [compliance, setCompliance] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => { if (jwt) load(); /* eslint-disable-next-line */ }, [jwt]);

    async function load() {
        setLoading(true);
        const [d, c] = await Promise.allSettled([
            HrGeneratedDocumentsEndpoints.listMine(),
            HrComplianceItemsEndpoints.listMine(),
        ]);
        if (d.status === "fulfilled") setDocs(d.value?.data || []);
        if (c.status === "fulfilled") setCompliance(c.value?.data || []);
        setLoading(false);
    }

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-1">My Documents</h2>
                <p className="text-muted small mb-4">Letters issued to you, and the documents HR tracks for you.</p>

                {loading && <p>Loading…</p>}

                {!loading && (
                    <>
                        <h5 className="mb-2">Letters</h5>
                        {docs.length === 0 ? (
                            <div className="alert alert-info">No letters have been issued to you yet.</div>
                        ) : (
                            <div className="table-responsive mb-4">
                                <table className="table table-striped align-middle">
                                    <thead className="table-dark">
                                        <tr><th>Document</th><th>Reference</th><th>Issued</th><th></th></tr>
                                    </thead>
                                    <tbody>
                                        {docs.map((d) => (
                                            <tr key={d.id}>
                                                <td>
                                                    <div className="fw-semibold">{d.subject || d.type}</div>
                                                    <div className="small text-muted">{d.template?.name || d.type}</div>
                                                </td>
                                                <td className="small text-muted">{d.reference_no || "—"}</td>
                                                <td>{fmt(d.generated_at)}</td>
                                                <td>
                                                    <button className="btn btn-sm btn-outline-primary" onClick={() => printLetter(d)}>
                                                        <i className="fa-solid fa-print me-1"></i>Print
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <h5 className="mb-2">Compliance &amp; expiries</h5>
                        {compliance.length === 0 ? (
                            <div className="alert alert-secondary">Nothing is being tracked for you.</div>
                        ) : (
                            <div className="table-responsive">
                                <table className="table table-striped align-middle">
                                    <thead className="table-dark">
                                        <tr><th>Type</th><th>Reference</th><th>Expires</th><th>Status</th><th>File</th></tr>
                                    </thead>
                                    <tbody>
                                        {compliance.map((c) => {
                                            const dleft = daysUntil(c.expiry_date);
                                            return (
                                                <tr key={c.id}>
                                                    <td>{c.type}</td>
                                                    <td className="small text-muted">{c.reference || "—"}</td>
                                                    <td>
                                                        {fmt(c.expiry_date)}
                                                        {dleft !== null && dleft >= 0 && dleft <= 60 && (
                                                            <span className="badge bg-warning text-dark ms-2">{dleft}d left</span>
                                                        )}
                                                        {dleft !== null && dleft < 0 && (
                                                            <span className="badge bg-danger ms-2">overdue</span>
                                                        )}
                                                    </td>
                                                    <td><span className={`badge bg-${COMPLIANCE_VARIANT[c.status] || "secondary"}`}>{c.status}</span></td>
                                                    <td>{c.document?.url ? <a href={c.document.url} target="_blank" rel="noopener noreferrer">View</a> : "—"}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}
            </Layout>
        </ProtectedRoute>
    );
}
