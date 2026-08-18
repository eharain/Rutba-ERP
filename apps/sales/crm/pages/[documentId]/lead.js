import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/shared/components/ProtectedRoute";
import { useAuth } from "@rutba/shared/context/AuthContext";
import { CrmLeadsEndpoints, CrmActivitiesEndpoints, CustomersEndpoints } from "@rutba/api-provider/endpoints";
import Link from "next/link";
import LeadForm from "../../components/form/LeadForm";
import ActivityForm from "../../components/form/ActivityForm";
import ActivityTimeline from "../../components/ActivityTimeline";
import { useLeadStatuses, leadStatusColor } from "../../components/leadStatus";

export default function LeadDetail() {
    const router = useRouter();
    const { documentId } = router.query;
    const { jwt } = useAuth();
    const [lead, setLead] = useState(null);
    const [timelineKey, setTimelineKey] = useState(0);
    const [editingActivity, setEditingActivity] = useState(null);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [loggingActivity, setLoggingActivity] = useState(false);
    const [converting, setConverting] = useState(false);
    const { statuses } = useLeadStatuses();

    const loadLead = () => {
        if (!jwt || !documentId) return;
        setLoading(true);
        CrmLeadsEndpoints.byId(documentId, { populate: ["contact", "customer"] })
            .then((res) => setLead(res.data || res))
            .catch((err) => console.error("Failed to load lead", err))
            .finally(() => setLoading(false));
    };

    // ActivityTimeline owns its own fetch — bump this to make it re-run after
    // an activity is logged, instead of reloading the whole lead.
    const refreshTimeline = () => setTimelineKey((k) => k + 1);

    // Timeline entries are normalised, not raw rows — fetch the full activity
    // before handing it to the form.
    const openActivityForEdit = async (activityDocumentId) => {
        try {
            const res = await CrmActivitiesEndpoints.byId(activityDocumentId, {
                populate: ["contact", "attachments"],
            });
            setEditingActivity(res.data || res);
            setLoggingActivity(false);
        } catch (err) {
            console.error("Failed to load the activity", err);
            alert("Could not open that activity for editing.");
        }
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

                {!loading && lead && editingActivity && (
                    <div className="card mb-4">
                        <div className="card-header d-flex justify-content-between align-items-center">
                            <strong>Edit Activity</strong>
                            <button className="btn-close" onClick={() => setEditingActivity(null)}></button>
                        </div>
                        <div className="card-body">
                            <ActivityForm
                                activity={editingActivity}
                                contact={lead.contact || undefined}
                                onSaved={() => { setEditingActivity(null); refreshTimeline(); }}
                                onCancel={() => setEditingActivity(null)}
                            />
                        </div>
                    </div>
                )}

                {!loading && lead && loggingActivity && (
                    <div className="card mb-4">
                        <div className="card-header d-flex justify-content-between align-items-center">
                            <strong>Log Activity{lead.contact ? ` for ${lead.contact.name}` : ""}</strong>
                            <button className="btn-close" onClick={() => setLoggingActivity(false)}></button>
                        </div>
                        <div className="card-body">
                            {/* Passing the lead links the activity to both the
                                contact and the lead, so it shows on either
                                timeline and in lead-scoped segment rules. */}
                            <ActivityForm
                                contact={lead.contact || undefined}
                                lead={lead}
                                onSaved={() => {
                                    setLoggingActivity(false);
                                    refreshTimeline();
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
                                        {statuses.map((s) => (
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

                            {/* Key the timeline on the linked contact: it's the
                                richer subject (contact touches + lead touches +
                                collaboration), and a lead-only feed would hide
                                everything logged before the lead existed. */}
                            {lead.contact ? (
                                <ActivityTimeline
                                    contactId={lead.contact.documentId || lead.contact.id}
                                    jwt={jwt}
                                    refreshKey={timelineKey}
                                    onEdit={openActivityForEdit}
                                />
                            ) : (
                                <div className="card">
                                    <div className="card-header"><strong>Timeline</strong></div>
                                    <div className="card-body text-muted">
                                        Link a contact to this lead to track activities.
                                    </div>
                                </div>
                            )}
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
