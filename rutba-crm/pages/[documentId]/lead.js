import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";
import Link from "next/link";
import LeadForm from "../../components/form/LeadForm";

export default function LeadDetail() {
    const router = useRouter();
    const { documentId } = router.query;
    const { jwt } = useAuth();
    const [lead, setLead] = useState(null);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);

    const loadLead = () => {
        if (!jwt || !documentId) return;
        setLoading(true);
        authApi.get(`/crm-leads/${documentId}?populate=*`, {}, jwt)
            .then((res) => setLead(res.data || res))
            .catch((err) => console.error("Failed to load lead", err))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        loadLead();
    }, [jwt, documentId]);

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex align-items-center mb-3">
                    <Link className="btn btn-sm btn-outline-secondary me-3" href="/leads">
                        <i className="fas fa-arrow-left"></i> Back
                    </Link>
                    <h2 className="mb-0">Lead Details</h2>
                    {!loading && lead && !editing && (
                        <button className="btn btn-sm btn-outline-primary ms-auto" onClick={() => setEditing(true)}>
                            <i className="fas fa-edit me-1"></i>Edit
                        </button>
                    )}
                </div>

                {loading && <p>Loading...</p>}

                {!loading && !lead && (
                    <div className="alert alert-warning">Lead not found.</div>
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
                                    onSaved={(updated) => {
                                        setEditing(false);
                                        loadLead();
                                    }}
                                    onCancel={() => setEditing(false)}
                                />
                            </div>
                        </div>
                    ) : (
                    <div className="row">
                        <div className="col-md-8">
                            <div className="card">
                                <div className="card-header d-flex justify-content-between">
                                    <strong>{lead.name}</strong>
                                    <span className={`badge bg-${leadStatusColor(lead.status)}`}>
                                        {lead.status || "New"}
                                    </span>
                                </div>
                                <div className="card-body">
                                    <p><strong>Source:</strong> {lead.source || "—"}</p>
                                    <p><strong>Email:</strong> {lead.email || "—"}</p>
                                    <p><strong>Phone:</strong> {lead.phone || "—"}</p>
                                    <p><strong>Company:</strong> {lead.company || "—"}</p>
                                    <p><strong>Assigned To:</strong> {lead.assigned_to || "—"}</p>
                                    <p><strong>Value:</strong> {lead.value != null ? lead.value.toFixed(2) : "—"}</p>
                                    {lead.notes && (
                                        <p><strong>Notes:</strong> {lead.notes}</p>
                                    )}
                                </div>
                            </div>
                        </div>
                        {lead.customer && (
                            <div className="col-md-4">
                                <div className="card">
                                    <div className="card-header"><strong>Linked Customer</strong></div>
                                    <div className="card-body">
                                        <p><strong>Name:</strong> {lead.customer.name || "—"}</p>
                                        <p><strong>Email:</strong> {lead.customer.email || "—"}</p>
                                        <p><strong>Phone:</strong> {lead.customer.phone || "—"}</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    )
                )}
            </Layout>
        </ProtectedRoute>
    );
}

function leadStatusColor(status) {
    switch (status) {
        case "Qualified": return "success";
        case "Contacted": return "info";
        case "Lost": return "danger";
        case "Negotiation": return "warning";
        case "New": return "primary";
        default: return "secondary";
    }
}

export async function getServerSideProps() { return { props: {} }; }
