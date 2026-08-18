import { useState, useEffect } from "react";
import Link from "next/link";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/shared/components/ProtectedRoute";
import { useAuth } from "@rutba/shared/context/AuthContext";
import { MailAccountsEndpoints } from "@rutba/api-provider/endpoints";

// Shared inboxes the caller can access — each links to its triage queue.

export default function SharedQueuesPage() {
    const { jwt } = useAuth();
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!jwt) return;
        MailAccountsEndpoints.list({ pageSize: 100, kind: "shared", filters: { is_active: true } })
            .then((res) => setAccounts(res?.data || []))
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, [jwt]);

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-3">Shared Queues</h2>
                {error && <div className="alert alert-danger">{error}</div>}
                {loading ? (
                    <p className="text-muted">Loading…</p>
                ) : accounts.length === 0 ? (
                    <div className="alert alert-light border">
                        No shared inboxes you can access. A mail manager can create one in
                        Accounts (kind = shared) and add owners or access roles.
                    </div>
                ) : (
                    <div className="row g-3">
                        {accounts.map((a) => (
                            <div className="col-md-4" key={a.documentId}>
                                <Link href={`/shared/${a.documentId}`} className="text-decoration-none">
                                    <div className="card h-100 border-info">
                                        <div className="card-body">
                                            <h5 className="card-title">
                                                <i className="fa-solid fa-users text-info me-2"></i>{a.name}
                                            </h5>
                                            <div className="text-muted">{a.email}</div>
                                            {Number(a.unseen_counts?.INBOX) > 0 && (
                                                <span className="badge bg-primary mt-2">{a.unseen_counts.INBOX} unseen</span>
                                            )}
                                        </div>
                                    </div>
                                </Link>
                            </div>
                        ))}
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}
