import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/shared/components/ProtectedRoute";
import { useAuth } from "@rutba/shared/context/AuthContext";
import { CmpAudiencesEndpoints } from "@rutba/api-provider/endpoints";

// Audience list (Phase 2). An audience is either a static uploaded list or a
// saved filter over crm-contact/customer/person, resolved through one service
// contract — see the campaigns spec §2.

export default function AudiencesPage() {
    const { jwt } = useAuth();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [notice, setNotice] = useState(null);
    const [name, setName] = useState("");
    const [busy, setBusy] = useState(false);

    const load = useCallback(() => {
        if (!jwt) return;
        setLoading(true);
        CmpAudiencesEndpoints.list({ pageSize: 100 })
            .then((res) => setRows(res?.data || []))
            .catch((err) => setNotice({ type: "danger", text: err.message }))
            .finally(() => setLoading(false));
    }, [jwt]);

    useEffect(() => { load(); }, [load]);

    const create = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            const res = await CmpAudiencesEndpoints.create({ name: name.trim(), source: "filter", entity: "crm-contact" });
            setName("");
            const documentId = res?.data?.documentId;
            if (documentId) window.location.href = `/audiences/${documentId}`;
            else load();
        } catch (err) {
            setNotice({ type: "danger", text: `Create failed: ${err.message}` });
        } finally {
            setBusy(false);
        }
    };

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h2 className="mb-0">Audiences</h2>
                    <form className="input-group" style={{ maxWidth: "24rem" }} onSubmit={create}>
                        <input className="form-control" placeholder="New audience name…" required
                            value={name} onChange={(e) => setName(e.target.value)} />
                        <button className="btn btn-primary" disabled={busy}>Create</button>
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
                    <div className="alert alert-light border">No audiences yet — create one to give campaigns someone to talk to.</div>
                ) : (
                    <div className="table-responsive">
                        <table className="table align-middle">
                            <thead><tr><th>Name</th><th>Source</th><th>Members</th><th>Last resolved</th></tr></thead>
                            <tbody>
                                {rows.map((a) => (
                                    <tr key={a.documentId}>
                                        <td><Link href={`/audiences/${a.documentId}`}>{a.name}</Link></td>
                                        <td>
                                            <span className="badge bg-secondary">{a.source}</span>
                                            {a.source === "filter" && <span className="text-muted small ms-2">{a.entity}</span>}
                                        </td>
                                        <td>{a.member_count ?? "—"}</td>
                                        <td className="text-muted small">
                                            {a.last_resolved_at ? new Date(a.last_resolved_at).toLocaleString() : "never"}
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
