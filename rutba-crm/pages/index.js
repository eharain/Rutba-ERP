import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { CrmLeadsEndpoints, CrmActivitiesEndpoints, CrmContactsEndpoints } from "@rutba/api-provider/endpoints";
import AppHome, {
    AppHomeStats,
    AppHomeStat,
    AppHomePanel,
    AppHomeEmpty,
    AppHomeSection,
} from "@rutba/pos-shared/components/AppHome";
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
                <AppHome
                    app="crm"
                    eyebrow="Sales & customers"
                    title="CRM"
                    subtitle="Manage customer relationships, track leads through the pipeline and keep every interaction on the record."
                    actions={
                        <>
                            <Link href="/leads" className="btn btn-accent">
                                <i className="fa-solid fa-bullseye me-2"></i>Leads board
                            </Link>
                            <Link href="/contacts" className="btn btn-outline-secondary">
                                <i className="fa-solid fa-address-book me-2"></i>Contacts
                            </Link>
                        </>
                    }
                >
                    <AppHomeSection title="At a glance" />
                    <AppHomeStats>
                        <AppHomeStat
                            label="Open leads"
                            value={openLeads.length}
                            icon="fa-bullseye"
                            tone="primary"
                            href="/leads"
                            loading={loading}
                        />
                        <AppHomeStat
                            label="Pipeline value"
                            value={pipelineValue.toLocaleString()}
                            icon="fa-sack-dollar"
                            tone="success"
                            loading={loading}
                        />
                        <AppHomeStat
                            label="New leads"
                            value={newThisWeek}
                            icon="fa-arrow-trend-up"
                            tone="info"
                            hint="last 7 days"
                            loading={loading}
                        />
                        <AppHomeStat
                            label="Contacts"
                            value={contactCount ?? "—"}
                            icon="fa-address-book"
                            tone="teal"
                            href="/contacts"
                            loading={loading}
                        />
                    </AppHomeStats>

                    <div className="row g-3">
                        <div className="col-lg-4">
                            <AppHomePanel title="Pipeline" icon="fa-chart-simple" tone="primary" href="/leads" linkLabel="View board" flush>
                                <ul className="app-list">
                                    {byStatus.map((s) => (
                                        <li key={s.status}>
                                            <div className="app-list-row">
                                                <span>
                                                    <span className={`badge bg-${leadStatusColor(s.status)} me-2`}>{s.count}</span>
                                                    {s.status}
                                                </span>
                                                <small className="text-muted">
                                                    {s.value > 0 ? s.value.toLocaleString() : ""}
                                                </small>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </AppHomePanel>
                        </div>

                        <div className="col-lg-4">
                            <AppHomePanel title="Recent activities" icon="fa-clock-rotate-left" tone="info" href="/activities" flush>
                                {recentActivities.length === 0 ? (
                                    <AppHomeEmpty>
                                        {loading ? "Loading…" : "No activities yet."}
                                    </AppHomeEmpty>
                                ) : (
                                    <ul className="app-list">
                                        {recentActivities.map((a) => (
                                            <li key={a.documentId || a.id}>
                                                <div className="app-list-row">
                                                    <span className="text-truncate me-2">{a.subject}</span>
                                                    <small className="text-muted text-nowrap">
                                                        {new Date(a.date).toLocaleDateString()}
                                                    </small>
                                                </div>
                                                <div className="app-list-meta">
                                                    {a.type || "Note"}
                                                    {a.contact ? ` · ${a.contact.name}` : ""}
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </AppHomePanel>
                        </div>

                        <div className="col-lg-4">
                            <AppHomePanel title="Upcoming follow-ups" icon="fa-calendar-day" tone="warning" flush>
                                {followUps.length === 0 ? (
                                    <AppHomeEmpty>
                                        {loading ? "Loading…" : "Nothing scheduled."}
                                    </AppHomeEmpty>
                                ) : (
                                    <ul className="app-list">
                                        {followUps.map((a) => (
                                            <li key={a.documentId || a.id}>
                                                <div className="app-list-row">
                                                    <span className="text-truncate me-2">{a.subject}</span>
                                                    <small className="text-muted text-nowrap">
                                                        {new Date(a.date).toLocaleString()}
                                                    </small>
                                                </div>
                                                {a.contact && (
                                                    <div className="app-list-meta">
                                                        <Link href={`/${a.contact.documentId || a.contact.id}/contact`}>
                                                            {a.contact.name}
                                                        </Link>
                                                    </div>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </AppHomePanel>
                        </div>
                    </div>
                </AppHome>
            </Layout>
        </ProtectedRoute>
    );
}
