import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { HrEmployeesEndpoints } from "@rutba/api-provider/endpoints";
import { AppHomeStats, AppHomeStat, AppHomeSection, AppHomePanel } from "./AppHome";

/**
 * Role-scoped HR dashboard. One endpoint serves every tier — the server decides
 * the scope (HR → org-wide, line manager → their reports, employee → self) and
 * echoes it back as `scope`, so this component only decides presentation.
 *
 * Rendered inside <AppHome> on both the HR and ESS landing pages, which is
 * where the tone variables it reads come from.
 */

const SCOPE_LABEL = {
    hr: "Organisation-wide",
    manager: "Your team",
    employee: "You",
};

export default function HrDashboard() {
    const { jwt } = useAuth();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (!jwt) return;
        let alive = true;
        (async () => {
            try {
                const res = await HrEmployeesEndpoints.getDashboard();
                if (alive) { setData(res?.data || null); setFailed(false); }
            } catch (err) {
                console.error("Failed to load HR dashboard", err);
                if (alive) setFailed(true);
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [jwt]);

    // Shimmer placeholders keep the page from jumping when the counts land.
    if (loading) {
        return (
            <>
                <AppHomeSection title="At a glance" />
                <AppHomeStats>
                    {["Headcount", "Present today", "On leave today", "Pending approvals"].map((label) => (
                        <AppHomeStat key={label} label={label} loading tone="secondary" />
                    ))}
                </AppHomeStats>
            </>
        );
    }

    if (failed || !data) return null; // a dashboard is a nicety — never block the page

    const pending = data.pending_approvals || {};
    const isEmployee = data.scope === "employee";
    const expiring = data.compliance?.expiring_60d;

    return (
        <>
            <div className="app-section-head">
                <h2 className="app-section-title">At a glance</h2>
                <span className="app-pill is-accent">{SCOPE_LABEL[data.scope] || data.scope}</span>
            </div>

            <AppHomeStats>
                {!isEmployee && (
                    <AppHomeStat label="Headcount" value={data.headcount ?? "—"} icon="fa-users" tone="primary" />
                )}
                <AppHomeStat
                    label="Present today"
                    value={data.attendance?.present_today ?? "—"}
                    icon="fa-user-check"
                    tone="success"
                />
                <AppHomeStat
                    label="On leave today"
                    value={data.attendance?.on_leave_today ?? "—"}
                    icon="fa-plane-departure"
                    tone="info"
                />
                <AppHomeStat
                    label={isEmployee ? "My pending requests" : "Pending approvals"}
                    value={pending.total ?? "—"}
                    icon="fa-clipboard-check"
                    tone={pending.total > 0 ? "warning" : "secondary"}
                    hint={pending.total > 0
                        ? `${pending.leave || 0} leave · ${pending.expense_claims || 0} claims · ${(pending.loans || 0) + (pending.advances || 0)} finance`
                        : null}
                />
                <AppHomeStat
                    label="Compliance expiring"
                    value={expiring ?? "—"}
                    icon="fa-shield-halved"
                    tone={expiring > 0 ? "danger" : "secondary"}
                    hint="next 60 days"
                />
                <AppHomeStat
                    label="Training in progress"
                    value={data.learning?.in_progress ?? "—"}
                    icon="fa-graduation-cap"
                    tone="teal"
                />
                <AppHomeStat
                    label="Appraisals open"
                    value={data.performance?.appraisals_open ?? "—"}
                    icon="fa-bullseye"
                    tone="purple"
                />
            </AppHomeStats>

            {Array.isArray(data.by_department) && data.by_department.length > 0 && (
                <AppHomePanel title="Headcount by department" icon="fa-sitemap" tone="primary">
                    {data.by_department.map((d) => {
                        const max = data.by_department[0].count || 1;
                        const pct = Math.round((d.count / max) * 100);
                        return (
                            <div key={d.department} className="mb-2">
                                <div className="d-flex justify-content-between small">
                                    <span>{d.department}</span>
                                    <span className="text-muted">{d.count}</span>
                                </div>
                                <div className="progress" style={{ height: 6, borderRadius: 999 }}>
                                    <div
                                        className="progress-bar"
                                        style={{ width: `${pct}%`, background: "var(--app-accent)", borderRadius: 999 }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </AppHomePanel>
            )}
        </>
    );
}
