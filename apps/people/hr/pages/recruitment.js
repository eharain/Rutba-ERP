import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/shared/components/ProtectedRoute";
import { useAuth } from "@rutba/shared/context/AuthContext";
import {
    HrJobRequisitionsEndpoints,
    HrCandidatesEndpoints,
    HrInterviewsEndpoints,
    HrOffersEndpoints,
} from "@rutba/api-provider/endpoints";

const REQ_VARIANT = { Draft: "secondary", Approved: "info", Open: "primary", Filled: "success", Cancelled: "dark" };
const CAND_VARIANT = { Applied: "secondary", Screening: "info", Interview: "primary", Offer: "warning", Hired: "success", Rejected: "danger" };
const OFFER_VARIANT = { Draft: "secondary", Sent: "info", Accepted: "success", Declined: "danger", Withdrawn: "dark" };

function fmt(d) {
    return d ? new Date(d).toLocaleDateString() : "—";
}

const TABS = [
    { key: "requisitions", label: "Requisitions", icon: "fa-clipboard-list" },
    { key: "candidates", label: "Candidates", icon: "fa-user-tie" },
    { key: "interviews", label: "Interviews", icon: "fa-comments" },
    { key: "offers", label: "Offers", icon: "fa-file-signature" },
];

export default function Recruitment() {
    const { jwt } = useAuth();
    const [tab, setTab] = useState("requisitions");
    const [data, setData] = useState({ requisitions: [], candidates: [], interviews: [], offers: [] });
    const [loading, setLoading] = useState(true);

    useEffect(() => { if (jwt) load(); /* eslint-disable-next-line */ }, [jwt]);

    async function load() {
        setLoading(true);
        const [r, c, i, o] = await Promise.allSettled([
            HrJobRequisitionsEndpoints.list({ pageSize: 100 }),
            HrCandidatesEndpoints.list({ pageSize: 200 }),
            HrInterviewsEndpoints.list({ pageSize: 200 }),
            HrOffersEndpoints.list({ pageSize: 100 }),
        ]);
        setData({
            requisitions: r.status === "fulfilled" ? r.value?.data || [] : [],
            candidates: c.status === "fulfilled" ? c.value?.data || [] : [],
            interviews: i.status === "fulfilled" ? i.value?.data || [] : [],
            offers: o.status === "fulfilled" ? o.value?.data || [] : [],
        });
        setLoading(false);
    }

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-1">Recruitment</h2>
                <p className="text-muted small mb-3">Requisitions through to offers. Candidates are entered by HR.</p>

                <ul className="nav nav-tabs mb-3">
                    {TABS.map((t) => (
                        <li className="nav-item" key={t.key}>
                            <button type="button" className={`nav-link ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>
                                <i className={`fa-solid ${t.icon} me-1`}></i>{t.label}
                                {data[t.key].length > 0 && <span className="badge bg-secondary ms-2">{data[t.key].length}</span>}
                            </button>
                        </li>
                    ))}
                </ul>

                {loading && <p>Loading…</p>}

                {!loading && tab === "requisitions" && (
                    data.requisitions.length === 0 ? <div className="alert alert-info">No requisitions raised.</div> : (
                        <div className="table-responsive">
                            <table className="table table-striped align-middle">
                                <thead className="table-dark"><tr><th>Title</th><th>Department</th><th>Headcount</th><th>Target</th><th>Status</th></tr></thead>
                                <tbody>
                                    {data.requisitions.map((r) => (
                                        <tr key={r.id}>
                                            <td>{r.title}</td>
                                            <td>{r.department?.name || "—"}</td>
                                            <td>{r.headcount ?? 1}</td>
                                            <td>{fmt(r.target_date)}</td>
                                            <td><span className={`badge bg-${REQ_VARIANT[r.status] || "secondary"}`}>{r.status}</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )
                )}

                {!loading && tab === "candidates" && (
                    data.candidates.length === 0 ? <div className="alert alert-info">No candidates yet.</div> : (
                        <div className="table-responsive">
                            <table className="table table-striped align-middle">
                                <thead className="table-dark"><tr><th>Name</th><th>Contact</th><th>Requisition</th><th>Source</th><th>Status</th><th>Resume</th></tr></thead>
                                <tbody>
                                    {data.candidates.map((c) => (
                                        <tr key={c.id}>
                                            <td>{c.name}</td>
                                            <td className="small text-muted">{c.email || "—"}{c.phone ? ` · ${c.phone}` : ""}</td>
                                            <td>{c.requisition?.title || "—"}</td>
                                            <td>{c.source || "—"}</td>
                                            <td><span className={`badge bg-${CAND_VARIANT[c.status] || "secondary"}`}>{c.status}</span></td>
                                            <td>{c.resume?.url ? <a href={c.resume.url} target="_blank" rel="noopener noreferrer">View</a> : "—"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )
                )}

                {!loading && tab === "interviews" && (
                    data.interviews.length === 0 ? <div className="alert alert-info">No interviews scheduled.</div> : (
                        <div className="table-responsive">
                            <table className="table table-striped align-middle">
                                <thead className="table-dark"><tr><th>Candidate</th><th>When</th><th>Round</th><th>Mode</th><th>Interviewer</th><th>Rating</th><th>Outcome</th></tr></thead>
                                <tbody>
                                    {data.interviews.map((i) => (
                                        <tr key={i.id}>
                                            <td>{i.candidate?.name || "—"}</td>
                                            <td>{i.scheduled_at ? new Date(i.scheduled_at).toLocaleString() : "—"}</td>
                                            <td>{i.round ?? 1}</td>
                                            <td>{i.mode}</td>
                                            <td>{i.interviewer?.name || "—"}</td>
                                            <td>{i.rating ?? "—"}</td>
                                            <td>{i.recommendation || i.status}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )
                )}

                {!loading && tab === "offers" && (
                    data.offers.length === 0 ? <div className="alert alert-info">No offers extended.</div> : (
                        <div className="table-responsive">
                            <table className="table table-striped align-middle">
                                <thead className="table-dark"><tr><th>Candidate</th><th>Requisition</th><th>Salary</th><th>Offered</th><th>Joining</th><th>Status</th></tr></thead>
                                <tbody>
                                    {data.offers.map((o) => (
                                        <tr key={o.id}>
                                            <td>{o.candidate?.name || "—"}</td>
                                            <td>{o.requisition?.title || "—"}</td>
                                            <td>{o.offered_salary ?? "—"}</td>
                                            <td>{fmt(o.offer_date)}</td>
                                            <td>{fmt(o.joining_date)}</td>
                                            <td><span className={`badge bg-${OFFER_VARIANT[o.status] || "secondary"}`}>{o.status}</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )
                )}
            </Layout>
        </ProtectedRoute>
    );
}
