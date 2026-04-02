import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";
import Link from "next/link";
import LeadForm from "../components/form/LeadForm";

export default function Leads() {
    const { jwt } = useAuth();
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);

    const loadLeads = () => {
        if (!jwt) return;
        setLoading(true);
        authApi.get("/crm-leads?sort=createdAt:desc&populate=customer", {}, jwt)
            .then((res) => setLeads(res.data || []))
            .catch((err) => console.error("Failed to load leads", err))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        loadLeads();
    }, [jwt]);

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h2 className="mb-0">Leads</h2>
                    <button className="btn btn-primary" onClick={() => setShowForm(true)}>
                        <i className="fas fa-plus me-1"></i>Add Lead
                    </button>
                </div>

                {showForm && (
                    <div className="card mb-4">
                        <div className="card-header d-flex justify-content-between align-items-center">
                            <strong>New Lead</strong>
                            <button className="btn-close" onClick={() => setShowForm(false)}></button>
                        </div>
                        <div className="card-body">
                            <LeadForm
                                onSaved={(newLead) => {
                                    setShowForm(false);
                                    loadLeads();
                                }}
                                onCancel={() => setShowForm(false)}
                            />
                        </div>
                    </div>
                )}

                {loading && <p>Loading leads...</p>}

                {!loading && leads.length === 0 && (
                    <div className="alert alert-info">No leads found.</div>
                )}

                {!loading && leads.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr>
                                    <th>Name</th>
                                    <th>Source</th>
                                    <th>Status</th>
                                    <th>Customer</th>
                                    <th>Assigned To</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {leads.map((l) => (
                                    <tr key={l.id}>
                                        <td>{l.name}</td>
                                        <td>{l.source || "—"}</td>
                                        <td>
                                            <span className={`badge bg-${leadStatusColor(l.status)}`}>
                                                {l.status || "New"}
                                            </span>
                                        </td>
                                        <td>{l.customer?.name || "—"}</td>
                                        <td>{l.assigned_to || "—"}</td>
                                        <td>
                                            <Link className="btn btn-sm btn-outline-primary" href={`/${l.documentId || l.id}/lead`}>
                                                View
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
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

