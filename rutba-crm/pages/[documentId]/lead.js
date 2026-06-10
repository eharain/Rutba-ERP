import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { CrmLeadsEndpoints, CrmActivitiesEndpoints, CustomersEndpoints } from "@rutba/api-provider/endpoints";
import Link from "next/link";
import LeadForm from "../../components/form/LeadForm";
import ActivityForm from "../../components/form/ActivityForm";
import { LEAD_STATUSES, leadStatusColor } from "../../components/leadStatus";

export default function LeadDetail() {
    const router = useRouter();
    const { documentId } = router.query;
    const { jwt } = useAuth();
    const [lead, setLead] = useState(null);
    const [activities, setActivities] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [loggingActivity, setLoggingActivity] = useState(false);
    const [converting, setConverting] = useState(false);

    const loadLead = () => {
        if (!jwt || !documentId) return;
        setLoading(true);
        CrmLeadsEndpoints.byId(documentId, { populate: ["contact", "customer"] })
            .then((res) => {
                const data = res.data || res;
                setLead(data);
                const contactId = data?.contact?.documentId;
                if (contactId) {
                    return CrmActivitiesEndpoints.list({
                        filters: { contact: { documentId: { $eq: contactId } } },
                        sort: ["date:desc"],
                        pageSize: 50,
                    }).then((actRes) => setActivities(actRes.data || []));
                }
                setActivities([]);
            })
            .catch((err) => console.error("Failed to load lead", err))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        loadLead();
    }, [jwt, documentId]);

    const handleStatusChange = async (status) => {
        try {
            await CrmLeadsEndpoints.update(lead.documentId, { status });
            setLead((prev) => ({ ...prev, status }));
        } catch (err) {
            console.error("Failed to update lead status", err);
            alert("Failed to update lead status.");
        }
    };

    // Convert a won lead: create a customer from the lead/contact details and
    // link it. The lead stays as the historical pipeline record.
    const handleConvert = async () => {
        if (!window.confirm(`Create a customer record for "${lead.name}" and link it to this lead?`)) return;
        setConverting(true);
        try {
            const src = lead.contact || lead;
            const created = await CustomersEndpoints.create({
                name: src.name || lead.name,
                email: src.email || lead.email || undefined,
                phone: src.phone || lead.phone || undefined,
                address: src.address || undefined,
            });
            const customer = created.data || created;
            await CrmLeadsEndpoints.update(lead.documentId, {
                customer: { connect: [customer.documentId] },
            });
            loadLead();
        } catch (err) {
            console.error("Failed to convert lead", err);
            alert("Failed to convert lead to customer.");
        } finally {
            setConverting(false);
        }
    };

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex align-items-center mb-3">
                    <Link className="btn btn-sm btn-outline-secondary me-3" href="/leads">
                        <i className="fas fa-arrow-left"></i> Back
                    </Link>
                    <h2 className="mb-0">Lead Details</h2>
                    {!loading && lead && !editing && (
                        <div className="ms-auto">
                            <button className="btn btn-sm btn-outline-secondary me-2" onClick={() => setLoggingActivity(true)}>
                                <i className="fas fa-clipboard-list me-1"></i>Log Activity
                            </button>
                            {!lead.customer && (
                                <button
                                    className="btn btn-sm btn-outline-success me-2"
                                    disabled={converting}
                                    onClick={handleConvert}
                                >
                                    <i className="fas fa-user-check me-1"></i>
                                    {converting ? "Converting…" : "Convert to Customer"}
                                </button>
                            )}
                            <button className="btn btn-sm btn-outline-primary" onClick={() => setEditing(true)}>
                                <i className="fas fa-edit me-1"></i>Edit
                            </button>
                        </div>
                    )}
                </div>

                {loading && <p>Loading...</p>}

                {!loading && !lead && (
                    <div className="alert alert-warning">Lead not found.</div>
                )}

                {!loading && lead && loggingActivity && (
                    <div className="card mb-4">
                        <div className="card-header d-flex justify-content-between align-items-center">
                            <strong>Log Activity{lead.contact ? ` for ${lead.contact.name}` : ""}</strong>
                            <button className="btn-close" onClick={() => setLoggingActivity(false)}></button>
                        </div>
                        <div className="card-body">
                            <ActivityForm
                                contact={lead.contact || undefined}
                                onSaved={() => {
                                    setLoggingActivity(false);
                                    loadLead();
                                }}
                                onCancel={() => setLoggingActivity(false)}
                            />
                        </div>
                    </div>
                )}

                {!loading && lead && (
                    editing ? (
                        <div className="card">
                            <div className="card-header d-flex justify-content-between align-items-center">
                                <strong>Edit Lead</strong>
                                <button className="btn-close" onClick={() => setEditing(false)}></button>
                            </div>
                            <div className="card-body">
                                <LeadForm
                                    lead={lead}
                                    onSaved={() => {
                                        setEditing(false);
                                        loadLead();
                                    }}
                                    onCancel={() => setEditing(false)}
                                />
                            </div>
                        </div>
                    ) : (
                    <div className="row g-3">
                        <div className="col-md-7">
                            <div className="card mb-3">
                                <div className="card-header d-flex justify-content-between align-items-center">
                                    <strong>{lead.name}</strong>
                                    <select
                                        className={`form-select form-select-sm w-auto border-${leadStatusColor(lead.status)}`}
                                        value={lead.status || "New"}
                                        onChange={(e) => handleStatusChange(e.target.value)}
                                    >
                                        {LEAD_STATUSES.map((s) => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="card-body">
                                    <p><strong>Source:</strong> {lead.source || "—"}</p>
                                    <p><strong>Email:</strong> {lead.email || "—"}</p>
                                    <p><strong>Phone:</strong> {lead.phone || "—"}</p>
                                    <p><strong>Company:</strong> {lead.company || "—"}</p>
                                    <p>
                                        <strong>Assigned To:</strong>{" "}
                                        {lead.assigned_to ? (lead.assigned_to.username || lead.assigned_to.email) : "—"}
                                    </p>
                                    <p><strong>Value:</strong> {lead.value != null ? Number(lead.value).toLocaleString() : "—"}</p>
                                    {lead.notes && (
                                        <p className="mb-0"><strong>Notes:</strong> {lead.notes}</p>
                                    )}
                                </div>
                            </div>

                            <div className="card">
                                <div className="card-header d-flex justify-content-between">
                                    <strong>Activity Timeline</strong>
                                    <span className="badge bg-secondary">{activities.length}</span>
                                </div>
                                {activities.length === 0 ? (
                                    <div className="card-body text-muted">
                                        {lead.contact
                                            ? "No activities recorded for the linked contact."
                                            : "Link a contact to this lead to track activities."}
                                    </div>
                                ) : (
                                    <ul className="list-group list-group-flush">
                                        {activities.map((a) => (
                                            <li key={a.documentId || a.id} className="list-group-item">
                                                <div className="d-flex justify-content-between">
                                                    <strong>{a.subject}</strong>
                                                    <small className="text-muted">{new Date(a.date).toLocaleString()}</small>
                                                </div>
                                                <div className="mt-1">
                                                    <span className="badge bg-secondary me-2">{a.type || "Note"}</span>
                                                    {a.description && <small className="text-muted">{a.description}</small>}
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>

                        <div className="col-md-5">
                            {lead.contact && (
                                <div className="card mb-3">
                                    <div className="card-header"><strong>Linked Contact</strong></div>
                                    <div className="card-body">
                                        <p>
                                            <strong>Name:</strong>{" "}
                                            <Link href={`/${lead.contact.documentId || lead.contact.id}/contact`}>
                                                {lead.contact.name}
                                            </Link>
                                        </p>
                                        <p><strong>Email:</strong> {lead.contact.email || "—"}</p>
                                        <p className="mb-0"><strong>Phone:</strong> {lead.contact.phone || "—"}</p>
                                    </div>
                                </div>
                            )}
                            {lead.customer && (
                                <div className="card">
                                    <div className="card-header"><strong>Linked Customer</strong></div>
                                    <div className="card-body">
                                        <p><strong>Name:</strong> {lead.customer.name || "—"}</p>
                                        <p><strong>Email:</strong> {lead.customer.email || "—"}</p>
                                        <p className="mb-0"><strong>Phone:</strong> {lead.customer.phone || "—"}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    )
                )}
            </Layout>
        </ProtectedRoute>
    );
}
