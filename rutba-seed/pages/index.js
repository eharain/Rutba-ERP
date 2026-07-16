import { useCallback, useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { SeedEndpoints } from "@rutba/api-provider/endpoints";

const CATEGORY_ORDER = ["system", "reference", "regional", "workflow", "backfill", "demo"];
const CATEGORY_LABEL = {
    system: "System",
    reference: "Reference data",
    regional: "Regional (tax & shipping)",
    backfill: "Backfills",
    workflow: "Workflows",
    demo: "Demo / tenant",
};

function errMessage(err) {
    const status = err?.response?.status;
    if (status === 403) return "You don't have the seed_admin role for this action.";
    if (status === 401) return "Your session expired — please sign in again.";
    return err?.response?.data?.error?.message || err?.message || "Request failed";
}

function StatusBadge({ status }) {
    const map = { ok: "bg-success", failed: "bg-danger", running: "bg-warning text-dark", skipped: "bg-secondary" };
    return <span className={`badge ${map[status] || "bg-light text-muted border"}`}>{status}</span>;
}

function SeedControl() {
    const { jwt } = useAuth();
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [selected, setSelected] = useState(() => new Set());
    const [mode, setMode] = useState("partial");
    const [running, setRunning] = useState(false);
    const [report, setReport] = useState(null);
    const [runError, setRunError] = useState(null);

    const loadStatus = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const data = await SeedEndpoints.getStatus({ limit: 15 });
            setStatus(data);
        } catch (err) {
            setLoadError(errMessage(err));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (jwt) loadStatus();
    }, [jwt, loadStatus]);

    const groups = useMemo(() => {
        const reg = status?.registry || [];
        const byCat = {};
        for (const e of reg) (byCat[e.category] ||= []).push(e);
        return CATEGORY_ORDER
            .filter((c) => byCat[c]?.length)
            .map((c) => ({ category: c, label: CATEGORY_LABEL[c] || c, entries: byCat[c] }));
    }, [status]);

    const allKeys = useMemo(() => (status?.registry || []).map((e) => e.key), [status]);

    const toggle = (key) => setSelected((prev) => {
        const next = new Set(prev);
        next.has(key) ? next.delete(key) : next.add(key);
        return next;
    });
    const toggleGroup = (entries, on) => setSelected((prev) => {
        const next = new Set(prev);
        for (const e of entries) on ? next.add(e.key) : next.delete(e.key);
        return next;
    });

    const run = async (only) => {
        setRunning(true);
        setRunError(null);
        setReport(null);
        try {
            const res = await SeedEndpoints.runSeed({
                mode,
                ...(only && only.length ? { only } : {}),
            });
            setReport(res);
            await loadStatus();
        } catch (err) {
            setRunError(errMessage(err));
        } finally {
            setRunning(false);
        }
    };

    const selectedList = [...selected];

    return (
        <>
            <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
                <div>
                    <h2 className="mb-0">Seeding <i className="fa-solid fa-seedling text-success" /></h2>
                    <p className="text-muted mb-0">
                        Run system, reference and backfill seeds on demand. Every seeder is
                        idempotent. <strong>Partial</strong> adds anything missing and
                        re-applies seed-managed records — this reverts manual edits to any
                        record not marked editable (e.g. CMS/content defaults), so avoid it
                        after tenant customisation. <strong>Full</strong> additionally forces
                        re-application for seeders that support it (see the “full ✓” badge).
                    </p>
                </div>
                <button className="btn btn-outline-secondary btn-sm" onClick={loadStatus} disabled={loading || running}>
                    <i className="fa-solid fa-rotate me-1" /> Refresh
                </button>
            </div>

            {loadError && (
                <div className="alert alert-warning d-flex align-items-center">
                    <i className="fa-solid fa-triangle-exclamation me-2" /> {loadError}
                </div>
            )}

            {/* ── Controls ── */}
            <div className="card mb-3">
                <div className="card-body d-flex flex-wrap align-items-center gap-3">
                    <div className="btn-group" role="group" aria-label="mode">
                        <input type="radio" className="btn-check" name="mode" id="mode-partial"
                            checked={mode === "partial"} onChange={() => setMode("partial")} />
                        <label className="btn btn-outline-primary" htmlFor="mode-partial">Partial</label>
                        <input type="radio" className="btn-check" name="mode" id="mode-full"
                            checked={mode === "full"} onChange={() => setMode("full")} />
                        <label className="btn btn-outline-danger" htmlFor="mode-full">Full re-apply</label>
                    </div>

                    <button className="btn btn-primary" disabled={running || !selectedList.length}
                        onClick={() => run(selectedList)}>
                        {running ? <span className="spinner-border spinner-border-sm me-2" /> : <i className="fa-solid fa-play me-2" />}
                        Run selected ({selectedList.length})
                    </button>

                    <button className="btn btn-success" disabled={running || !allKeys.length}
                        onClick={() => run(null)}>
                        <i className="fa-solid fa-forward me-2" /> Run all ({mode})
                    </button>

                    <button className="btn btn-outline-secondary btn-sm ms-auto"
                        disabled={running} onClick={() => setSelected(new Set())}>
                        Clear selection
                    </button>
                </div>
            </div>

            {runError && (
                <div className="alert alert-danger d-flex align-items-center">
                    <i className="fa-solid fa-circle-xmark me-2" /> {runError}
                </div>
            )}

            {/* ── Last run report ── */}
            {report && (
                <div className={`card mb-3 ${report.ok ? "border-success" : "border-danger"}`}>
                    <div className="card-header d-flex justify-content-between align-items-center">
                        <span>
                            <strong>Last run</strong> — {report.summary?.okCount} ok,{" "}
                            {report.summary?.failedCount} failed, +{report.summary?.created} created,
                            ~{report.summary?.updated} updated
                        </span>
                        <StatusBadge status={report.ok ? "ok" : "failed"} />
                    </div>
                    <div className="table-responsive">
                        <table className="table table-sm mb-0 align-middle">
                            <thead><tr>
                                <th>Seeder</th><th>Status</th><th className="text-end">Created</th>
                                <th className="text-end">Updated</th><th className="text-end">Skipped</th>
                                <th className="text-end">ms</th><th>Error</th>
                            </tr></thead>
                            <tbody>
                                {report.results?.map((r) => (
                                    <tr key={r.key} className={r.status === "failed" ? "table-danger" : undefined}>
                                        <td><code>{r.key}</code></td>
                                        <td><StatusBadge status={r.status} /></td>
                                        <td className="text-end">{r.created ?? 0}</td>
                                        <td className="text-end">{r.updated ?? 0}</td>
                                        <td className="text-end">{r.skipped ?? 0}</td>
                                        <td className="text-end text-muted">{r.ms}</td>
                                        <td className="text-danger small">{r.error || ""}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── Registry (tailor) ── */}
            {loading && !status ? (
                <div className="text-center text-muted py-5"><span className="spinner-border" /></div>
            ) : (
                groups.map((g) => {
                    const allOn = g.entries.every((e) => selected.has(e.key));
                    return (
                        <div className="card mb-3" key={g.category}>
                            <div className="card-header d-flex justify-content-between align-items-center">
                                <strong>{g.label}</strong>
                                <button className="btn btn-sm btn-link text-decoration-none p-0"
                                    onClick={() => toggleGroup(g.entries, !allOn)}>
                                    {allOn ? "Deselect all" : "Select all"}
                                </button>
                            </div>
                            <ul className="list-group list-group-flush">
                                {g.entries.map((e) => (
                                    <li className="list-group-item d-flex align-items-center gap-2" key={e.key}>
                                        <input type="checkbox" className="form-check-input mt-0"
                                            checked={selected.has(e.key)} onChange={() => toggle(e.key)} />
                                        <div className="flex-grow-1">
                                            <div>{e.title} <code className="text-muted small">{e.key}</code></div>
                                        </div>
                                        {e.essential && <span className="badge bg-dark">essential</span>}
                                        {e.hasMigration && <span className="badge bg-info text-dark">migration</span>}
                                        {e.supportsFull && <span className="badge bg-light text-muted border">full ✓</span>}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    );
                })
            )}

            {/* ── Recent history (compact) ── */}
            {status?.recentRuns?.length > 0 && (
                <div className="card mb-4">
                    <div className="card-header"><strong>Recent runs</strong></div>
                    <div className="table-responsive">
                        <table className="table table-sm mb-0 align-middle">
                            <thead><tr>
                                <th>When</th><th>Mode</th><th>Source</th><th>Status</th>
                                <th className="text-end">OK</th><th className="text-end">Failed</th>
                                <th>By</th>
                            </tr></thead>
                            <tbody>
                                {status.recentRuns.map((r) => (
                                    <tr key={r.id}>
                                        <td className="small">{r.started_at ? new Date(r.started_at).toLocaleString() : "—"}</td>
                                        <td>{r.mode}</td>
                                        <td className="text-muted small">{r.source}</td>
                                        <td><StatusBadge status={r.status} /></td>
                                        <td className="text-end">{r.ok_count}</td>
                                        <td className="text-end text-danger">{r.failed_count}</td>
                                        <td className="text-muted small">{r.triggered_by}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </>
    );
}

export default function Home() {
    return (
        <ProtectedRoute>
            <Layout>
                <SeedControl />
            </Layout>
        </ProtectedRoute>
    );
}
