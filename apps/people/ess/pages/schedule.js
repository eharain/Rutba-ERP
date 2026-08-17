import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { HrRostersEndpoints, HrHolidayCalendarsEndpoints } from "@rutba/api-provider/endpoints";

function fmtDate(d) {
    return d ? new Date(d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "—";
}

/** "09:00:00.000" → "09:00" (Strapi time fields carry seconds/millis). */
function fmtTime(t) {
    if (!t) return "—";
    const parts = String(t).split(":");
    return parts.length >= 2 ? `${parts[0]}:${parts[1]}` : String(t);
}

function isPast(dateStr) {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d < today;
}

export default function Schedule() {
    const { jwt } = useAuth();
    const [roster, setRoster] = useState([]);
    const [holidays, setHolidays] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => { if (jwt) load(); /* eslint-disable-next-line */ }, [jwt]);

    async function load() {
        setLoading(true);
        try {
            // Independent reads — one failing (e.g. no holiday calendar configured)
            // must not blank out the other half of the page.
            const [rosterRes, holidayRes] = await Promise.allSettled([
                HrRostersEndpoints.listMine(),
                HrHolidayCalendarsEndpoints.list({ sort: ["date:asc"], pageSize: 100 }),
            ]);
            if (rosterRes.status === "fulfilled") setRoster(rosterRes.value?.data || []);
            else console.error("Failed to load roster", rosterRes.reason);
            if (holidayRes.status === "fulfilled") setHolidays(holidayRes.value?.data || []);
            else console.error("Failed to load holidays", holidayRes.reason);
        } finally {
            setLoading(false);
        }
    }

    const upcomingHolidays = holidays.filter((h) => h.is_recurring_yearly || !isPast(h.date));

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-1">My Schedule</h2>
                <p className="text-muted small mb-3">Your assigned shifts and the company holiday calendar.</p>

                {loading && <p>Loading…</p>}

                {!loading && (
                    <div className="row g-4">
                        <div className="col-lg-7">
                            <h5 className="mb-2">Shift Roster</h5>
                            {roster.length === 0 ? (
                                <div className="alert alert-info">No shifts have been assigned to you yet.</div>
                            ) : (
                                <div className="table-responsive">
                                    <table className="table table-striped table-hover align-middle">
                                        <thead className="table-dark">
                                            <tr><th>Date</th><th>Shift</th><th>Timing</th><th>Notes</th></tr>
                                        </thead>
                                        <tbody>
                                            {roster.map((r) => (
                                                <tr key={r.id} className={isPast(r.date) ? "text-muted" : ""}>
                                                    <td>{fmtDate(r.date)}</td>
                                                    <td>{r.shift?.name || "—"}</td>
                                                    <td>
                                                        {r.shift
                                                            ? `${fmtTime(r.shift.start_time)} – ${fmtTime(r.shift.end_time)}`
                                                            : "—"}
                                                    </td>
                                                    <td>{r.notes || "—"}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        <div className="col-lg-5">
                            <h5 className="mb-2">Holidays</h5>
                            {upcomingHolidays.length === 0 ? (
                                <div className="alert alert-info">No holidays are on the calendar.</div>
                            ) : (
                                <ul className="list-group">
                                    {upcomingHolidays.map((h) => (
                                        <li key={h.id} className="list-group-item d-flex justify-content-between align-items-start gap-2">
                                            <div>
                                                <div className="fw-semibold">{h.name}</div>
                                                {h.description && <div className="small text-muted">{h.description}</div>}
                                                {h.is_recurring_yearly && (
                                                    <span className="badge bg-light text-dark border mt-1">Every year</span>
                                                )}
                                            </div>
                                            <span className="text-nowrap small text-muted">{fmtDate(h.date)}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}
