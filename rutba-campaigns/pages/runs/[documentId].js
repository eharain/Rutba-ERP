import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { CmpRunsEndpoints, CmpRecipientsEndpoints } from "@rutba/api-provider/endpoints";

// One run: live counters (webhook + report-poller fed) and the per-recipient
// grid that makes every address attributable.

const COUNTERS = [
    ["total", "Total"], ["queued", "Queued"], ["sent", "Sent"],
    ["opened", "Opened"], ["clicked", "Clicked"],
    ["bounced_hard", "Hard bounce"], ["bounced_soft", "Soft bounce"],
    ["suppressed", "Suppressed"], ["failed", "Failed"], ["unsubscribed", "Unsub"],
];

export default function RunDetailPage() {
    const router = useRouter();
    const { documentId } = router.query;
    const { jwt } = useAuth();

    const [run, setRun] = useState(null);
    const [recipients, setRecipients] = useState([]);
    const [page, setPage] = useState(1);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState(null);

    const load = useCallback(() => {
        if (!jwt || !router.isReady || !documentId) return;
        Promise.all([
            CmpRunsEndpoints.byId(documentId),
            CmpRecipientsEndpoints.list({ runDocId: documentId, page, pageSize: 50 }),
        ])
            .then(([r, rec]) => {
                setRun(r?.data || null);
                setRecipients(rec?.data || []);
            })
            .catch((err) => setNotice({ type: "danger", text: err.message }));
    }, [jwt, router.isReady, documentId, page]);

    useEffect(() => { load(); }, [load]);

    const sync = async () => {
        setBusy(true);
        try {
            const res = await CmpRunsEndpoints.syncRun(documentId);
            setNotice(res?.ok
                ? { type: "success", text: res.complete ? "Report synced — run complete." : "Report synced." }
                : { type: "warning", text: res?.error || "Sync did not run." });
            load();
        } catch (err) {
            setNotice({ type: "danger", text: `Sync failed: ${err.message}` });
        } finally {
            setBusy(false);
        }
    };

    if (!run) {
        return <ProtectedRoute><Layout><p className="text-muted">Loading…</p></Layout></ProtectedRoute>;
    }

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h2 className="mb-0">
                        <Link href="/runs" className="text-decoration-none"><i className="fa-solid fa-arrow-left me-2"></i></Link>
                        {run.campaign?.name || "Run"}
                        <span className="badge bg-secondary ms-2">{run.state}</span>
                    </h2>
                    <button className="btn btn-outline-primary" disabled={busy} onClick={sync}>
                        {busy ? "Syncing…" : "Sync report"}
                    </button>
                </div>

                {notice && (
                    <div className={`alert alert-${notice.type} alert-dismissible`}>
                        {notice.text}
                        <button type="button" className="btn-close" onClick={() => setNotice(null)}></button>
                    </div>
                )}
                {run.error && <div className="alert alert-danger">{run.error}</div>}

                <div className="row g-2 mb-3">
                    {COUNTERS.map(([key, label]) => (
                        <div className="col-6 col-md-3 col-lg-auto flex-lg-fill" key={key}>
                            <div className="card text-center">
                                <div className="card-body py-2">
                                    <div className="fs-4">{run[key] ?? "—"}</div>
                                    <div className="text-muted small">{label}</div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="card">
                    <div className="card-header py-2 d-flex justify-content-between align-items-center">
                        <strong>Recipients</strong>
                        <div className="btn-group btn-group-sm">
                            <button className="btn btn-outline-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                                <i className="fa-solid fa-chevron-left"></i>
                            </button>
                            <button className="btn btn-outline-secondary" disabled>{page}</button>
                            <button className="btn btn-outline-secondary" disabled={recipients.length < 50} onClick={() => setPage(page + 1)}>
                                <i className="fa-solid fa-chevron-right"></i>
                            </button>
                        </div>
                    </div>
                    {recipients.length === 0 ? (
                        <div className="card-body text-muted">No recipient rows.</div>
                    ) : (
                        <div className="table-responsive">
                            <table className="table table-sm align-middle mb-0">
                                <thead><tr><th>Email</th><th>Status</th><th>Sent at</th><th>Opened</th><th>Clicked</th><th>Last event</th><th>Error</th></tr></thead>
                                <tbody>
                                    {recipients.map((r) => (
                                        <tr key={r.documentId}>
                                            <td>{r.email}</td>
                                            <td><span className="badge bg-secondary">{r.status}</span></td>
                                            <td className="small">{r.sent_at ? new Date(r.sent_at).toLocaleString() : ""}</td>
                                            <td className="small">{r.opened_at ? new Date(r.opened_at).toLocaleString() : ""}</td>
                                            <td className="small">{r.clicked_at ? new Date(r.clicked_at).toLocaleString() : ""}</td>
                                            <td className="small">{r.last_event_at ? new Date(r.last_event_at).toLocaleString() : ""}</td>
                                            <td className="small text-danger">{r.error}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </Layout>
        </ProtectedRoute>
    );
}
