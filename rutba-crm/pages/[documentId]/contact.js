import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import WorkItemPanel from "@rutba/pos-shared/components/workflow/WorkItemPanel";
import { CrmContactsEndpoints, CrmActivitiesEndpoints } from "@rutba/api-provider/endpoints";
import Link from "next/link";
import ContactForm from "../../components/form/ContactForm";
import ActivityForm from "../../components/form/ActivityForm";
import LeadForm from "../../components/form/LeadForm";
import ActivityTimeline from "../../components/ActivityTimeline";
import MailTimeline from "../../components/MailTimeline";

const CONTACT_UID = "api::crm-contact.crm-contact";

const TABS = [
    { key: "timeline", label: "Timeline", icon: "fa-clock-rotate-left" },
    { key: "details", label: "Details", icon: "fa-id-card" },
    { key: "leads", label: "Leads", icon: "fa-user-plus" },
    { key: "collab", label: "Collaboration", icon: "fa-comments" },
];

export default function ContactDetail() {
    const router = useRouter();
    const { documentId } = router.query;
    const { jwt, user } = useAuth();
    const [contact, setContact] = useState(null);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [loggingActivity, setLoggingActivity] = useState(false);
    const [editingActivity, setEditingActivity] = useState(null);
    const [creatingLead, setCreatingLead] = useState(false);
    const [tab, setTab] = useState("timeline");
    const [timelineKey, setTimelineKey] = useState(0);

    const loadContact = () => {
        if (!jwt || !documentId) return;
        setLoading(true);
        CrmContactsEndpoints.byId(documentId, { populate: ["leads", "person"] })
            .then((res) => setContact(res.data || res))
            .catch((err) => console.error("Failed to load contact", err))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        loadContact();
    }, [jwt, documentId]);

    const leads = contact?.leads || [];
    const refreshTimeline = () => setTimelineKey((k) => k + 1);

    // The timeline carries normalised entries, not raw rows — fetch the full
    // activity (attachments, follow-up fields) before handing it to the form.
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

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex align-items-center mb-3">
                    <Link className="btn btn-sm btn-outline-secondary me-3" href="/contacts">
                        <i className="fas fa-arrow-left"></i> Back
                    </Link>
                    <h2 className="mb-0">{loading ? "Contact" : contact?.name || "Contact"}</h2>
                    {!loading && contact && !editing && (
                        <div className="ms-auto">
                            <button className="btn btn-sm btn-outline-secondary me-2" onClick={() => setLoggingActivity(true)}>
                                <i className="fas fa-clipboard-list me-1"></i>Log Activity
                            </button>
                            <button className="btn btn-sm btn-outline-info me-2" onClick={() => setCreatingLead(true)}>
                                <i className="fas fa-user-plus me-1"></i>New Lead
                            </button>
                            <button className="btn btn-sm btn-outline-primary" onClick={() => setEditing(true)}>
                                <i className="fas fa-edit me-1"></i>Edit
                            </button>
                        </div>
                    )}
                </div>

                {loading && <p>Loading...</p>}

                {!loading && !contact && <div className="alert alert-warning">Contact not found.</div>}

                {!loading && contact && editing && (
                    <div className="card mb-4">
                        <div className="card-header d-flex justify-content-between align-items-center">
                            <strong>Edit Contact</strong>
                            <button className="btn-close" onClick={() => setEditing(false)}></button>
                        </div>
                        <div className="card-body">
                            <ContactForm
                                contact={contact}
                                onSaved={() => { setEditing(false); loadContact(); }}
                                onCancel={() => setEditing(false)}
                            />
                        </div>
                    </div>
                )}

                {!loading && contact && loggingActivity && (
                    <div className="card mb-4">
                        <div className="card-header d-flex justify-content-between align-items-center">
                            <strong>Log Activity for {contact.name}</strong>
                            <button className="btn-close" onClick={() => setLoggingActivity(false)}></button>
                        </div>
                        <div className="card-body">
                            <ActivityForm
                                contact={contact}
                                onSaved={() => { setLoggingActivity(false); refreshTimeline(); }}
                                onCancel={() => setLoggingActivity(false)}
                            />
                        </div>
                    </div>
                )}

                {!loading && contact && editingActivity && (
                    <div className="card mb-4">
                        <div className="card-header d-flex justify-content-between align-items-center">
                            <strong>Edit Activity</strong>
                            <button className="btn-close" onClick={() => setEditingActivity(null)}></button>
                        </div>
                        <div className="card-body">
                            <ActivityForm
                                activity={editingActivity}
                                contact={contact}
                                onSaved={() => { setEditingActivity(null); refreshTimeline(); }}
                                onCancel={() => setEditingActivity(null)}
                            />
                        </div>
                    </div>
                )}

                {!loading && contact && creatingLead && (
                    <div className="card mb-4">
                        <div className="card-header d-flex justify-content-between align-items-center">
                            <strong>New Lead for {contact.name}</strong>
                            <button className="btn-close" onClick={() => setCreatingLead(false)}></button>
                        </div>
                        <div className="card-body">
                            <LeadForm
                                contact={contact}
                                onSaved={() => { setCreatingLead(false); loadContact(); }}
                                onCancel={() => setCreatingLead(false)}
                            />
                        </div>
                    </div>
                )}

                {!loading && contact && !editing && (
                    <div className="row g-3">
                        <div className="col-md-4">
                            <div className="card mb-3">
                                <div className="card-header"><strong>{contact.name}</strong></div>
                                <div className="card-body">
                                    <p className="mb-1"><strong>Email:</strong> {contact.email || "—"}</p>
                                    <p className="mb-1"><strong>Phone:</strong> {contact.phone || "—"}</p>
                                    <p className="mb-1"><strong>Company:</strong> {contact.company || "—"}</p>
                                    <p className="mb-0"><strong>Address:</strong> {contact.address || "—"}</p>
                                </div>
                                <div className="card-footer bg-white">
                                    {/* The unified contact identity. A contact with no person
                                        can't be reached by a person-based segment, so surface it
                                        rather than leaving it silently missing. */}
                                    {contact.person ? (
                                        <small className="text-success">
                                            <i className="fas fa-link me-1"></i>
                                            Linked to person <strong>{contact.person.name}</strong>
                                        </small>
                                    ) : (
                                        <small className="text-warning">
                                            <i className="fas fa-triangle-exclamation me-1"></i>
                                            Not linked to a person — add an email or phone, or check the dedup audit.
                                        </small>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="col-md-8">
                            <ul className="nav nav-tabs mb-3">
                                {TABS.map((t) => (
                                    <li className="nav-item" key={t.key}>
                                        <button
                                            className={`nav-link ${tab === t.key ? "active" : ""}`}
                                            onClick={() => setTab(t.key)}
                                        >
                                            <i className={`fas ${t.icon} me-1`}></i>{t.label}
                                            {t.key === "leads" && leads.length > 0 && (
                                                <span className="badge bg-secondary ms-2">{leads.length}</span>
                                            )}
                                        </button>
                                    </li>
                                ))}
                            </ul>

                            {tab === "timeline" && (
                                <>
                                    <ActivityTimeline
                                        contactId={contact.documentId}
                                        jwt={jwt}
                                        refreshKey={timelineKey}
                                        onEdit={openActivityForEdit}
                                    />
                                    {/* Linked email from rutba-mail. Kept beside the
                                        activity feed rather than given its own tab:
                                        it self-hides when there are no links or the
                                        caller has no mail role, and an empty tab
                                        reads as something being broken. */}
                                    <MailTimeline
                                        entityUid={CONTACT_UID}
                                        targetDocumentId={contact.documentId}
                                    />
                                </>
                            )}

                            {tab === "details" && (
                                <div className="card">
                                    <div className="card-header"><strong>Details</strong></div>
                                    <div className="card-body">
                                        <dl className="row mb-0">
                                            <dt className="col-sm-3">Notes</dt>
                                            <dd className="col-sm-9">{contact.notes || "—"}</dd>
                                            <dt className="col-sm-3">Created</dt>
                                            <dd className="col-sm-9">
                                                {contact.createdAt ? new Date(contact.createdAt).toLocaleString() : "—"}
                                            </dd>
                                            <dt className="col-sm-3">Person email</dt>
                                            <dd className="col-sm-9">{contact.person?.email || "—"}</dd>
                                            <dt className="col-sm-3">Person phone</dt>
                                            <dd className="col-sm-9">{contact.person?.phone || "—"}</dd>
                                        </dl>
                                    </div>
                                </div>
                            )}

                            {tab === "leads" && (
                                <div className="card">
                                    <div className="card-header d-flex justify-content-between">
                                        <strong>Leads</strong>
                                        <span className="badge bg-secondary">{leads.length}</span>
                                    </div>
                                    {leads.length === 0 ? (
                                        <div className="card-body text-muted">No leads linked to this contact.</div>
                                    ) : (
                                        <ul className="list-group list-group-flush">
                                            {leads.map((l) => (
                                                <li key={l.documentId || l.id} className="list-group-item d-flex justify-content-between align-items-center">
                                                    <Link href={`/${l.documentId || l.id}/lead`}>{l.name}</Link>
                                                    <span className="badge bg-secondary">{l.status || "New"}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}

                            {tab === "collab" && (
                                /* Comments and watchers come from the entity-agnostic
                                   work-item primitive keyed by entity_uid — CRM does not
                                   carry its own comment table. Assignment is off: a CRM
                                   contact isn't a workflow work item with an assignee
                                   relation, so the generic assign endpoint would reject it. */
                                <WorkItemPanel
                                    entityUid={CONTACT_UID}
                                    documentId={contact.documentId}
                                    jwt={jwt}
                                    currentUserId={user?.id}
                                    canAssign={false}
                                />
                            )}
                        </div>
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}
