import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { MarketplaceAccountsEndpoints, MarketplaceSyncLogsEndpoints } from "@rutba/api-provider/endpoints";

const STATUS_VARIANT = { success: "success", partial: "warning", error: "danger", running: "info" };

function StatCard({ icon, label, value, variant = "primary" }) {
    return (
        <div className="col-sm-6 col-lg-3">
            <div className="card h-100 shadow-sm">
                <div className="card-body d-flex align-items-center gap-3">
                    <div className={`rounded-circle bg-${variant} bg-opacity-10 text-${variant} d-flex align-items-center justify-content-center`} style={{ width: 46, height: 46 }}>
                        <i className={`fas ${icon}`}></i>
                    </div>
                    <div>
                        <div className="h4 mb-0">{value}</div>
                        <div className="text-muted small">{label}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function DashboardPage() {
    const { jwt } = useAuth();
    const [accounts, setAccounts] = useState([]);
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const [accRes, logRes] = await Promise.all([
                MarketplaceAccountsEndpoints.list({ pageSize: 200 }),
                MarketplaceSyncLogsEndpoints.list({ sort: ["createdAt:desc"], populate: ["marketplace_account"], pageSize: 8 }),
            ]);
            setAccounts(accRes.data || []);
            setLogs(logRes.data || []);
        } catch (err) {
            console.error("Failed to load dashboard", err);
        } finally {
            setLoading(false);
        }
    }, [jwt]);

    useEffect(() => { load(); }, [load]);

    const connected = accounts.filter((a) => a.last_connected_at).length;
    const active = accounts.filter((a) => a.is_active !== false).length;
    const lastRun = logs[0];

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h3><i className="fas fa-gauge me-2"></i>Marketplace</h3>
                    <Link href="/accounts" className="btn btn-primary btn-sm"><i className="fas fa-plug me-1"></i>Manage Accounts</Link>
                </div>

                {loading && <div className="text-center py-4"><div className="spinner-border"></div></div>}

                <div className="row g-3 mb-4">
                    <StatCard icon="fa-plug" label="Accounts" value={accounts.length} variant="primary" />
                    <StatCard icon="fa-link" label="Connected" value={connected} variant="success" />
                    <StatCard icon="fa-toggle-on" label="Active" value={active} variant="info" />
                    <StatCard icon="fa-clock-rotate-left" label="Last run" value={lastRun ? (STATUS_VARIANT[lastRun.status] ? lastRun.status : "—") : "—"} variant={STATUS_VARIANT[lastRun?.status] || "secondary"} />
                </div>

                <div className="card shadow-sm">
                    <div className="card-header d-flex justify-content-between align-items-center">
                        <span><i className="fas fa-rotate me-2"></i>Recent sync runs</span>
                        <Link href="/sync-runs" className="small">View all</Link>
                    </div>
                    <div className="card-body p-0">
                        {logs.length === 0 ? (
                            <div className="p-3 text-muted">No sync runs yet — connect an account and the worker will start pulling orders, or trigger a sync from the Accounts page.</div>
                        ) : (
                            <table className="table table-sm mb-0 align-middle">
                                <thead>
                                    <tr><th className="ps-3">When</th><th>Account</th><th>Kind</th><th>Status</th><th className="text-end pe-3">Created / Updated / Failed</th></tr>
                                </thead>
                                <tbody>
                                    {logs.map((l) => (
                                        <tr key={l.id}>
                                            <td className="ps-3 small">{new Date(l.started_at || l.createdAt).toLocaleString()}</td>
                                            <td className="small">{l.marketplace_account?.account_name || "—"} <span className="text-muted">({l.platform})</span></td>
                                            <td><span className="badge bg-light text-dark border text-capitalize">{l.kind}</span></td>
                                            <td><span className={`badge bg-${STATUS_VARIANT[l.status] || "secondary"}`}>{l.status}</span></td>
                                            <td className="text-end pe-3 small">{l.created || 0} / {l.updated || 0} / {l.failed ? <span className="text-danger fw-bold">{l.failed}</span> : 0}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </Layout>
        </ProtectedRoute>
    );
}
