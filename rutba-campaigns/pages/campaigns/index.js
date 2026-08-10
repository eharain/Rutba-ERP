import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { CmpCampaignsEndpoints } from "@rutba/api-provider/endpoints";

const STATUS_BADGE = {
    Draft: "secondary", Scheduled: "info", Running: "primary", Paused: "warning",
    Completed: "success", Failed: "danger", Cancelled: "dark",
};

export default function CampaignsPage() {
    const { jwt } = useAuth();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(null);
    const [notice, setNotice] = useState(null);
    const [name, setName] = useState("");

    const load = useCallback(() => {
        if (!jwt) return;
        setLoading(true);
        CmpCampaignsEndpoints.list({ pageSize: 100 })
            .then((res) => setRows(res?.data || []))
            .catch((err) => setNotice({ type: "danger", text: err.message }))
            .finally(() => setLoading(false));
    }, [jwt]);

    useEffect(() => { load(); }, [load]);

    const create = async (e) => {
        e.preventDefault();
        setBusy("create");
        try {
            const res = await CmpCampaignsEndpoints.create({ name: name.trim(), channel: "email", status: "Draft" });
            const documentId = res?.data?.documentId;
            if (documentId) window.location.href = `/campaigns/${documentId}`;
        } catch (err) {
            setNotice({ type: "danger", text: `Create failed: ${err.message}` });
        } finally {
            setBusy(null);
        }
    };

    const run = async (c) => {
        if (!window.confirm(`Run "${c.name}" NOW?\n\nThis resolves the audience and submits a real batch to the MTA.`)) return;
        setBusy(`run:${c.documentId}`);
        try {
            const res = await CmpCampaignsEndpoints.runCampaign(c.documentId);
            setNotice({ type: "success", text: `Run started — ${res?.run?.total} recipients.` });
            load();
        } catch (err) {
            setNotice({ type: "danger", text: `Run failed: ${err.message}` });
            load();
        } finally {
            setBusy(null);
        }
    };

    const cancel = async (c) => {
        if (!window.confirm(`Cancel "${c.name}"? Future runs stop; in-flight sends are not recalled.`)) return;
        setBusy(`cancel:${c.documentId}`);
        try {
            await CmpCampaignsEndpoints.cancelCampaign(c.documentId);
            load();
        } catch (err) {
            setNotice({ type: "danger", text: `Cancel failed: ${err.message}` });
        } finally {
            setBusy(null);
        }
    };

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h2 className="mb-0">Campaigns</h2>
                    <form className="input-group" style={{ maxWidth: "24rem" }} onSubmit={create}>
                        <input className="form-control" placeholder="New campaign name…" required
                            value={name} onChange={(e) => setName(e.target.value)} />
                        <button className="btn btn-primary" disabled={busy === "create"}>Create</button>
                    </form>
                </div>
                {notice && (
                    <div className={`alert alert-${notice.type} alert-dismissible`}>
                        {notice.text}
                        <button type="button" className="btn-close" onClick={() => setNotice(null)}></button>
                    </div>
                )}
                {loading ? (
                    <p className="text-muted">Loading…</p>
                ) : rows.length === 0 ? (
                    <div className="alert alert-light border">No campaigns yet.</div>
                ) : (
                    <div className="table-responsive">
                        <table className="table align-middle">
                            <thead>
                                <tr><th>Name</th><th>Status</th><th>Runs</th><th>Next run</th><th>Last error</th><th></th></tr>
                            </thead>
                            <tbody>
                                {rows.map((c) => (
                                    <tr key={c.documentId}>
                                        <td><Link href={`/campaigns/${c.documentId}`}>{c.name}</Link></td>
                                        <td><span className={`badge bg-${STATUS_BADGE[c.status] || "secondary"}`}>{c.status}</span></td>
                                        <td>{c.run_count || 0}{c.max_runs ? `/${c.max_runs}` : ""}</td>
                                        <td className="text-muted small">
                                            {c.next_run_at ? new Date(c.next_run_at).toLocaleString() : "—"}
                                        </td>
                                        <td className="text-danger small text-truncate" style={{ maxWidth: "16rem" }}>{c.last_error}</td>
                                        <td className="text-end">
                                            <button className="btn btn-sm btn-outline-primary me-2"
                                                disabled={busy === `run:${c.documentId}` || ["Running", "Cancelled"].includes(c.status)}
                                                onClick={() => run(c)}>
                                                {busy === `run:${c.documentId}` ? "Starting…" : "Run now"}
                                            </button>
                                            <button className="btn btn-sm btn-outline-danger"
                                                disabled={busy === `cancel:${c.documentId}` || ["Cancelled", "Completed"].includes(c.status)}
                                                onClick={() => cancel(c)}>
                                                Cancel
                                            </button>
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
