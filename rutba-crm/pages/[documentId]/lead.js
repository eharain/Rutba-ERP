import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";
import Link from "next/link";

export default function LeadDetail() {
    const router = useRouter();
    const { documentId } = router.query;
    const { jwt } = useAuth();
    const [lead, setLead] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!jwt || !documentId) return;
        authApi.get(`/crm-leads/${documentId}?populate=*`, {}, jwt)
            .then((res) => setLead(res.data || res))
            .catch((err) => console.error("Failed to load lead", err))
            .finally(() => setLoading(false));
    }, [jwt, documentId]);

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex align-items-center mb-3">
                    <Link className="btn btn-sm btn-outline-secondary me-3" href="/leads">
                        <i className="fas fa-arrow-left"></i> Back
                    </Link>
                    <h2 className="mb-0">Lead Details</h2>
                </div>

                {loading && <p>Loading...</p>}

                {!loading && !lead && (
                    <div className="alert alert-warning">Lead not found.</div>
                )}

                {!loading && lead && (
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
                    </div>
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
