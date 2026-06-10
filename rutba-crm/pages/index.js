import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { CrmLeadsEndpoints, CrmActivitiesEndpoints, CrmContactsEndpoints } from "@rutba/api-provider/endpoints";
import Link from "next/link";
import { LEAD_STATUSES, leadStatusColor } from "../components/leadStatus";

const OPEN_STATUSES = ["New", "Contacted", "Qualified", "Negotiation"];

export default function Home() {
    const { jwt } = useAuth();
    const [leads, setLeads] = useState([]);
    const [recentActivities, setRecentActivities] = useState([]);
    const [followUps, setFollowUps] = useState([]);
    const [contactCount, setContactCount] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!jwt) return;
        setLoading(true);
        Promise.all([
            CrmLeadsEndpoints.list({ pageSize: 200, fields: ["status", "value", "createdAt", "name"] }),
            CrmActivitiesEndpoints.list({ pageSize: 8, sort: ["date:desc"], populate: ["contact"] }),
            CrmActivitiesEndpoints.list({
                pageSize: 5,
                sort: ["date:asc"],
                populate: ["contact"],
                filters: {
                    type: { $eq: "Follow-up" },
                    date: { $gte: new Date().toISOString() },
                },
            }),
            CrmContactsEndpoints.list({ pageSize: 1, fields: ["id"] }),
        ])
            .then(([leadRes, actRes, fuRes, contactRes]) => {
                setLeads(leadRes.data || []);
                setRecentActivities(actRes.data || []);
                setFollowUps(fuRes.data || []);
                setContactCount(contactRes.meta?.pagination?.total ?? null);
            })
            .catch((err) => console.error("Failed to load dashboard", err))
            .finally(() => setLoading(false));
    }, [jwt]);

    const byStatus = LEAD_STATUSES.map((status) => {
        const rows = leads.filter((l) => (l.status || "New") === status);
        return {
            status,
            count: rows.length,
            value: rows.reduce((sum, l) => sum + (Number(l.value) || 0), 0),
        };
    });
    const openLeads = leads.filter((l) => OPEN_STATUSES.includes(l.status || "New"));
    const pipelineValue = openLeads.reduce((sum, l) => sum + (Number(l.value) || 0), 0);
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const newThisWeek = leads.filter((l) => new Date(l.createdAt).getTime() >= weekAgo).length;

    return (
        <ProtectedRoute>
            <Layout>
                <h2>Welcome to Rutba CRM 🤝</h2>
                <p className="text-muted mb-4">
                    Manage customer relationships, track leads, and monitor interactions.
                </p>

                {loading && <p>Loading dashboard...</p>}

                {!loading && (
                    <>
                        <div className="row g-3 mb-4">
                            <div className="col-6 col-md-3">
                                <div className="card border-primary h-100">
                                    <div className="card-body text-center">
                                        <div className="fs-3 fw-bold">{openLeads.length}</div>
                                        <div className="text-muted">Open Leads</div>
                                    </div>
                                </div>
                            </div>
                            <div className="col-6 col-md-3">
                                <div className="card border-success h-100">
                                    <div className="card-body text-center">
                                        <div className="fs-3 fw-bold">{pipelineValue.toLocaleString()}</div>
                                        <div className="text-muted">Pipeline Value</div>
                                    </div>
                                </div>
                            </div>
                            <div className="col-6 col-md-3">
                                <div className="card border-info h-100">
                                    <div className="card-body text-center">
                                        <div className="fs-3 fw-bold">{newThisWeek}</div>
                                        <div className="text-muted">New Leads (7d)</div>
                                    </div>
                                </div>
                            </div>
                            <div className="col-6 col-md-3">
                                <div className="card border-secondary h-100">
                                    <div className="card-body text-center">
                                        <div className="fs-3 fw-bold">{contactCount ?? "—"}</div>
                                        <div className="text-muted">Contacts</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="row g-3">
                            <div className="col-lg-4">
                                <div className="card h-100">
                                    <div className="card-header d-flex justify-content-between">
                                        <strong>Pipeline</strong>
                                        <Link className="small" href="/leads">View board</Link>
                                    </div>
                                    <ul className="list-group list-group-flush">
                                        {byStatus.map((s) => (
                                            <li key={s.status} className="list-group-item d-flex justify-content-between align-items-center">
                                                <span>
                                                    <span className={`badge bg-${leadStatusColor(s.status)} me-2`}>{s.count}</span>
                                                    {s.status}
                                                </span>
                                                <small className="text-muted">
                                                    {s.value > 0 ? s.value.toLocaleString() : ""}
                                                </small>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>

                            <div className="col-lg-4">
                                <div className="card h-100">
                                    <div className="card-header d-flex justify-content-between">
                                        <strong>Recent Activities</strong>
                                        <Link className="small" href="/activities">View all</Link>
                                    </div>
                                    {recentActivities.length === 0 ? (
                                        <div className="card-body text-muted">No activities yet.</div>
                                    ) : (
                                        <ul className="list-group list-group-flush">
                                            {recentActivities.map((a) => (
                                                <li key={a.documentId || a.id} className="list-group-item">
                                                    <div className="d-flex justify-content-between">
                                                        <span className="text-truncate me-2">{a.subject}</span>
                                                        <small className="text-muted text-nowrap">
                                                            {new Date(a.date).toLocaleDateString()}
                                                        </small>
                                                    </div>
                                                    <small className="text-muted">
                                                        {a.type || "Note"}
                                                        {a.contact ? ` · ${a.contact.name}` : ""}
                                                    </small>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>

                            <div className="col-lg-4">
                                <div className="card h-100">
                                    <div className="card-header"><strong>Upcoming Follow-ups</strong></div>
                                    {followUps.length === 0 ? (
                                        <div className="card-body text-muted">Nothing scheduled.</div>
                                    ) : (
                                        <ul className="list-group list-group-flush">
                                            {followUps.map((a) => (
                                                <li key={a.documentId || a.id} className="list-group-item">
                                                    <div className="d-flex justify-content-between">
                                                        <span className="text-truncate me-2">{a.subject}</span>
                                                        <small className="text-muted text-nowrap">
                                                            {new Date(a.date).toLocaleString()}
                                                        </small>
                                                    </div>
                                                    {a.contact && (
                                                        <small className="text-muted">
                                                            <Link href={`/${a.contact.documentId || a.contact.id}/contact`}>
                                                                {a.contact.name}
                                                            </Link>
                                                        </small>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </Layout>
        </ProtectedRoute>
    );
}
