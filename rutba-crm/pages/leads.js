import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";
import Link from "next/link";

export default function Leads() {
    const { jwt } = useAuth();
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!jwt) return;
        authApi.get("/crm-leads?sort=createdAt:desc", {}, jwt)
            .then((res) => setLeads(res.data || []))
            .catch((err) => console.error("Failed to load leads", err))
            .finally(() => setLoading(false));
    }, [jwt]);

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-3">Leads</h2>

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

export async function getServerSideProps() { return { props: {} }; }
