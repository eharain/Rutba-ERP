import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { HrEmployeesEndpoints } from "@rutba/api-provider/endpoints";

/**
 * Role-scoped HR dashboard. One endpoint serves every tier — the server decides
 * the scope (HR → org-wide, line manager → their reports, employee → self) and
 * echoes it back as `scope`, so this component only decides presentation.
 */

const SCOPE_LABEL = {
    hr: "Organisation-wide",
    manager: "Your team",
    employee: "You",
};

function Stat({ label, value, icon, variant = "secondary", hint }) {
    return (
        <div className="col-6 col-md-4 col-xl-3">
            <div className="card h-100">
                <div className="card-body py-3">
                    <div className="d-flex align-items-center gap-2 mb-1">
                        <i className={`fa-solid ${icon} text-${variant}`}></i>
                        <span className="small text-muted">{label}</span>
                    </div>
                    <div className="fs-4 fw-semibold">{value ?? "—"}</div>
                    {hint && <div className="small text-muted">{hint}</div>}
                </div>
            </div>
        </div>
    );
}

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

    if (loading) return <p>Loading dashboard…</p>;
    if (failed || !data) return null; // a dashboard is a nicety — never block the page

    const pending = data.pending_approvals || {};
    const isEmployee = data.scope === "employee";

    return (
        <div className="mb-4">
            <div className="d-flex align-items-center justify-content-between mb-2 flex-wrap gap-2">
                <h5 className="mb-0">At a glance</h5>
                <span className="badge bg-light text-dark border">{SCOPE_LABEL[data.scope] || data.scope}</span>
            </div>

            <div className="row g-3">
                {!isEmployee && (
                    <Stat label="Headcount" value={data.headcount} icon="fa-users" variant="primary" />
                )}
                <Stat label="Present today" value={data.attendance?.present_today} icon="fa-user-check" variant="success" />
                <Stat label="On leave today" value={data.attendance?.on_leave_today} icon="fa-plane-departure" variant="info" />
                <Stat
                    label={isEmployee ? "My pending requests" : "Pending approvals"}
                    value={pending.total}
                    icon="fa-clipboard-check"
                    variant={pending.total > 0 ? "warning" : "secondary"}
                    hint={pending.total > 0
                        ? `${pending.leave || 0} leave · ${pending.expense_claims || 0} claims · ${(pending.loans || 0) + (pending.advances || 0)} finance`
                        : null}
                />
                <Stat
                    label="Compliance expiring"
                    value={data.compliance?.expiring_60d}
                    icon="fa-shield-halved"
                    variant={data.compliance?.expiring_60d > 0 ? "danger" : "secondary"}
                    hint="next 60 days"
                />
                <Stat label="Training in progress" value={data.learning?.in_progress} icon="fa-graduation-cap" variant="info" />
                <Stat label="Appraisals open" value={data.performance?.appraisals_open} icon="fa-bullseye" variant="primary" />
            </div>

            {Array.isArray(data.by_department) && data.by_department.length > 0 && (
                <div className="card mt-3">
                    <div className="card-body">
                        <h6 className="mb-3">Headcount by department</h6>
                        {data.by_department.map((d) => {
                            const max = data.by_department[0].count || 1;
                            const pct = Math.round((d.count / max) * 100);
                            return (
                                <div key={d.department} className="mb-2">
                                    <div className="d-flex justify-content-between small">
                                        <span>{d.department}</span>
                                        <span className="text-muted">{d.count}</span>
                                    </div>
                                    <div className="progress" style={{ height: 6 }}>
                                        <div className="progress-bar" style={{ width: `${pct}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
