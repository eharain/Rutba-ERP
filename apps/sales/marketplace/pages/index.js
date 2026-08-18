import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/shared/components/ProtectedRoute";
import { useAuth } from "@rutba/shared/context/AuthContext";
import AppHome, {
    AppHomeStats,
    AppHomeStat,
    AppHomePanel,
    AppHomeEmpty,
    AppHomeSection,
} from "@rutba/shared/components/AppHome";
import { MarketplaceAccountsEndpoints, MarketplaceSyncLogsEndpoints } from "@rutba/api-provider/endpoints";

const STATUS_VARIANT = { success: "success", partial: "warning", error: "danger", running: "info" };

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
                <AppHome
                    app="marketplace"
                    eyebrow="Channels"
                    title="Marketplace"
                    subtitle="Channel accounts and the sync worker that keeps their orders, inventory and listings in step with Rutba."
                    actions={
                        <>
                            <Link href="/accounts" className="btn btn-accent">
                                <i className="fa-solid fa-plug me-2"></i>Manage accounts
                            </Link>
                            <button type="button" className="btn btn-outline-secondary" onClick={load} disabled={loading}>
                                <i className={`fa-solid fa-rotate me-2${loading ? " fa-spin" : ""}`}></i>Refresh
                            </button>
                        </>
                    }
                >
                    <AppHomeSection title="At a glance" />
                    <AppHomeStats>
                        <AppHomeStat label="Accounts" value={accounts.length} icon="fa-plug" tone="primary" href="/accounts" loading={loading} />
                        <AppHomeStat label="Connected" value={connected} icon="fa-link" tone="success" loading={loading} />
                        <AppHomeStat label="Active" value={active} icon="fa-toggle-on" tone="info" loading={loading} />
                        <AppHomeStat
                            label="Last run"
                            value={lastRun?.status || "—"}
                            icon="fa-clock-rotate-left"
                            tone={STATUS_VARIANT[lastRun?.status] || "secondary"}
                            hint={lastRun ? new Date(lastRun.started_at || lastRun.createdAt).toLocaleString() : null}
                            loading={loading}
                        />
                    </AppHomeStats>

                    <AppHomePanel title="Recent sync runs" icon="fa-rotate" tone="primary" href="/sync-runs" flush>
                        {logs.length === 0 ? (
                            <AppHomeEmpty>
                                {loading
                                    ? "Loading…"
                                    : "No sync runs yet — connect an account and the worker will start pulling orders, or trigger a sync from the Accounts page."}
                            </AppHomeEmpty>
                        ) : (
                            <div className="table-responsive">
                                <table className="table table-sm mb-0 align-middle">
                                    <thead>
                                        <tr>
                                            <th className="ps-3">When</th>
                                            <th>Account</th>
                                            <th>Kind</th>
                                            <th>Status</th>
                                            <th className="text-end pe-3">Created / Updated / Failed / Attention</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {logs.map((l) => (
                                            <tr key={l.id}>
                                                <td className="ps-3 small">{new Date(l.started_at || l.createdAt).toLocaleString()}</td>
                                                <td className="small">{l.marketplace_account?.account_name || "—"} <span className="text-muted">({l.platform})</span></td>
                                                <td><span className="badge bg-light text-dark border text-capitalize">{l.kind}</span></td>
                                                <td><span className={`badge bg-${STATUS_VARIANT[l.status] || "secondary"}`}>{l.status}</span></td>
                                                <td className="text-end pe-3 small">{l.created || 0} / {l.updated || 0} / {l.failed ? <span className="text-danger fw-bold">{l.failed}</span> : 0} / {l.attention ? <span className="text-warning-emphasis fw-bold" title="Created, but with line items whose SKU matched no product — see Sync Runs.">{l.attention}</span> : 0}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </AppHomePanel>
                </AppHome>
            </Layout>
        </ProtectedRoute>
    );
}
