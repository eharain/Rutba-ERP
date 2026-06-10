import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { CrmContactsEndpoints } from "@rutba/api-provider/endpoints";
import Link from "next/link";
import ContactForm from "../../components/form/ContactForm";
import ActivityForm from "../../components/form/ActivityForm";
import LeadForm from "../../components/form/LeadForm";

const ACTIVITY_ICONS = {
    "Call": "fa-phone",
    "Email": "fa-envelope",
    "Meeting": "fa-handshake",
    "Note": "fa-sticky-note",
    "Follow-up": "fa-bell",
};

export default function ContactDetail() {
    const router = useRouter();
    const { documentId } = router.query;
    const { jwt } = useAuth();
    const [contact, setContact] = useState(null);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [loggingActivity, setLoggingActivity] = useState(false);
    const [creatingLead, setCreatingLead] = useState(false);

    const loadContact = () => {
        if (!jwt || !documentId) return;
        setLoading(true);
        CrmContactsEndpoints.byId(documentId, { populate: ["leads", "activities"] })
            .then((res) => setContact(res.data || res))
            .catch((err) => console.error("Failed to load contact", err))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        loadContact();
    }, [jwt, documentId]);

    const activities = (contact?.activities || [])
        .slice()
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    const leads = contact?.leads || [];

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex align-items-center mb-3">
                    <Link className="btn btn-sm btn-outline-secondary me-3" href="/contacts">
                        <i className="fas fa-arrow-left"></i> Back
                    </Link>
                    <h2 className="mb-0">Contact Details</h2>
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

                {!loading && !contact && (
                    <div className="alert alert-warning">Contact not found.</div>
                )}

                {!loading && contact && editing && (
                    <div className="card mb-4">
                        <div className="card-header d-flex justify-content-between align-items-center">
                            <strong>Edit Contact</strong>
                            <button className="btn-close" onClick={() => setEditing(false)}></button>
                        </div>
                        <div className="card-body">
                            <ContactForm
                                contact={contact}
                                onSaved={() => {
                                    setEditing(false);
                                    loadContact();
                                }}
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
                                onSaved={() => {
                                    setLoggingActivity(false);
                                    loadContact();
                                }}
                                onCancel={() => setLoggingActivity(false)}
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
                                onSaved={() => {
                                    setCreatingLead(false);
                                    loadContact();
                                }}
                                onCancel={() => setCreatingLead(false)}
                            />
                        </div>
                    </div>
                )}

                {!loading && contact && !editing && (
                    <div className="row g-3">
                        <div className="col-md-5">
                            <div className="card mb-3">
                                <div className="card-header"><strong>{contact.name}</strong></div>
                                <div className="card-body">
                                    <p><strong>Email:</strong> {contact.email || "—"}</p>
                                    <p><strong>Phone:</strong> {contact.phone || "—"}</p>
                                    <p><strong>Company:</strong> {contact.company || "—"}</p>
                                    <p><strong>Address:</strong> {contact.address || "—"}</p>
                                    {contact.notes && (
                                        <p className="mb-0"><strong>Notes:</strong> {contact.notes}</p>
                                    )}
                                </div>
                            </div>

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
                        </div>

                        <div className="col-md-7">
                            <div className="card">
                                <div className="card-header d-flex justify-content-between">
                                    <strong>Activity Timeline</strong>
                                    <span className="badge bg-secondary">{activities.length}</span>
                                </div>
                                {activities.length === 0 ? (
                                    <div className="card-body text-muted">No activities recorded for this contact.</div>
                                ) : (
                                    <ul className="list-group list-group-flush">
                                        {activities.map((a) => (
                                            <li key={a.documentId || a.id} className="list-group-item">
                                                <div className="d-flex justify-content-between">
                                                    <span>
                                                        <i className={`fas ${ACTIVITY_ICONS[a.type] || "fa-sticky-note"} me-2 text-muted`}></i>
                                                        <strong>{a.subject}</strong>
                                                    </span>
                                                    <small className="text-muted">
                                                        {new Date(a.date).toLocaleString()}
                                                    </small>
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
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}
