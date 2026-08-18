import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/shared/components/ProtectedRoute";
import OrgChart from "@rutba/shared/components/OrgChart";
import { useAuth } from "@rutba/shared/context/AuthContext";
import { HrEmployeesEndpoints } from "@rutba/api-provider/endpoints";

export default function OrgChartPage() {
    const { jwt } = useAuth();
    const [gap, setGap] = useState(null);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);
    const [nonce, setNonce] = useState(0);

    useEffect(() => { if (jwt) loadGap(); /* eslint-disable-next-line */ }, [jwt]);

    async function loadGap() {
        try {
            const res = await HrEmployeesEndpoints.listWithoutReportingLine();
            setGap({ rows: res?.data || [], meta: res?.meta || {} });
        } catch (err) {
            setGap(null); // not an HR claim — the chart still works
        }
    }

    async function runBackfill(dryRun) {
        setBusy(true);
        try {
            const res = await HrEmployeesEndpoints.runReportingLineBackfill(dryRun);
            setResult({ ...res?.data, dry_run: dryRun });
            if (!dryRun) { await loadGap(); setNonce((n) => n + 1); }
        } catch (err) {
            console.error("Backfill failed", err);
            alert("Could not run the backfill.");
        } finally {
            setBusy(false);
        }
    }

    const uncovered = gap?.meta?.uncovered ?? 0;
    const total = gap?.meta?.total ?? 0;
    const orgRoots = gap?.meta?.org_roots || [];
    const cutoverReady = gap?.meta?.cutover_ready === true;

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-1">Org Chart</h2>
                <p className="text-muted small mb-3">
                    Who reports to whom, and how teams nest. Switch views with the toggle.
                    Dotted-line managers appear beside a person; add or change them under{" "}
                    <a href="/reporting-lines">Matrix Reporting</a>.
                </p>

                {gap && total > 0 && (
                    <div className={`alert ${uncovered > 0 ? "alert-warning" : "alert-secondary"}`}>
                        <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
                            <div>
                                <strong>{total}</strong> employee{total === 1 ? " has" : "s have"} no reporting line set.
                                {uncovered > 0 ? (
                                    <>
                                        {" "}<strong>{uncovered}</strong> of them {uncovered === 1 ? "is" : "are"} not covered by a
                                        team manager either — nobody can currently approve for {uncovered === 1 ? "them" : "them"}.
                                    </>
                                ) : (
                                    <>
                                        {" "}All of them are still covered by a team manager, so approvals keep
                                        working today — but only because the team graph is still granting
                                        authority. This number, not the uncovered one, is what has to reach
                                        zero before that can be switched off.
                                    </>
                                )}
                            </div>
                            <div className="d-flex gap-2">
                                <button className="btn btn-sm btn-outline-secondary" onClick={() => runBackfill(true)} disabled={busy}>
                                    Preview backfill
                                </button>
                                <button className="btn btn-sm btn-primary" onClick={() => runBackfill(false)} disabled={busy}>
                                    Apply backfill
                                </button>
                            </div>
                        </div>

                        {result && (
                            <div className="mt-3 small border-top pt-2">
                                <div className="fw-semibold">
                                    {result.dry_run ? "Preview — nothing was changed" : "Backfill applied"}
                                </div>
                                <div>Would set / set: <strong>{result.applied}</strong></div>
                                {result.ambiguous_multi_team?.length > 0 && (
                                    <div className="text-muted">
                                        Skipped (in more than one team, so the manager is ambiguous):{" "}
                                        {result.ambiguous_multi_team.join(", ")}
                                    </div>
                                )}
                                {result.no_team?.length > 0 && (
                                    <div className="text-muted">
                                        Skipped (in no team with a manager): {result.no_team.join(", ")}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {gap && cutoverReady && (
                    <div className="alert alert-success py-2 small">
                        Every active employee has a reporting line
                        {orgRoots.length > 0 && (
                            <> (other than {orgRoots.join(", ")}, marked as the top of the organisation)</>
                        )}.
                        Approval authority can now be moved off the team graph and onto the reporting
                        line alone — see the cutover note in{" "}
                        <code>docs/todo/hr-org-chart-and-reporting-line.md</code>.
                    </div>
                )}

                {gap && orgRoots.length > 0 && !cutoverReady && (
                    <p className="small text-muted">
                        Excluded from the count above: {orgRoots.join(", ")} — marked as the top of the
                        organisation, so having no manager is correct.
                    </p>
                )}

                <div className="card">
                    <div className="card-body">
                        <OrgChart key={nonce} defaultView="reporting" editable />
                    </div>
                </div>
            </Layout>
        </ProtectedRoute>
    );
}
