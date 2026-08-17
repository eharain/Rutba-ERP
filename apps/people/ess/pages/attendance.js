import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { HrAttendancesEndpoints } from "@rutba/api-provider/endpoints";

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : "—");
const fmtTime = (t) => (t ? String(t).slice(0, 5) : "—");

export default function Attendance() {
    const { jwt } = useAuth();
    const [mine, setMine] = useState([]);
    const [team, setTeam] = useState([]);
    const [hasTeam, setHasTeam] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => { if (jwt) load(); /* eslint-disable-next-line */ }, [jwt]);

    async function load() {
        setLoading(true);
        try {
            const res = await HrAttendancesEndpoints.listMyAttendance();
            setMine(res?.data || []);
        } catch (err) {
            console.error("Failed to load attendance", err);
        }
        try {
            const res = await HrAttendancesEndpoints.listTeamAttendance();
            setTeam(res?.data || []);
            setHasTeam(true);
        } catch (err) {
            // Not a manager (ess_manager claim required) — no team section.
            setHasTeam(false);
            setTeam([]);
        } finally {
            setLoading(false);
        }
    }

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-3">My Attendance</h2>

                {loading && <p>Loading…</p>}
                {!loading && mine.length === 0 && <div className="alert alert-info">No attendance records yet.</div>}
                {!loading && mine.length > 0 && <AttendanceTable rows={mine} showEmployee={false} />}

                {!loading && hasTeam && (
                    <>
                        <h2 className="mb-3 mt-4">Team Attendance</h2>
                        {team.length === 0
                            ? <div className="alert alert-info">No attendance records for your team.</div>
                            : <AttendanceTable rows={team} showEmployee={true} />}
                    </>
                )}
            </Layout>
        </ProtectedRoute>
    );
}

function AttendanceTable({ rows, showEmployee }) {
    return (
        <div className="table-responsive">
            <table className="table table-striped table-hover">
                <thead className="table-dark">
                    <tr>
                        {showEmployee && <th>Employee</th>}
                        <th>Date</th><th>Status</th><th>Check In</th><th>Check Out</th><th>Notes</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((a) => (
                        <tr key={a.id}>
                            {showEmployee && <td>{a.employee?.name || "—"}</td>}
                            <td>{fmtDate(a.date)}</td>
                            <td><span className={`badge bg-${statusColor(a.status)}`}>{a.status || "—"}</span></td>
                            <td>{fmtTime(a.check_in)}</td>
                            <td>{fmtTime(a.check_out)}</td>
                            <td>{a.notes || "—"}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function statusColor(status) {
    switch (status) {
        case "Present": return "success";
        case "Late": return "warning";
        case "Absent": return "danger";
        case "Leave": return "secondary";
        default: return "secondary";
    }
}
