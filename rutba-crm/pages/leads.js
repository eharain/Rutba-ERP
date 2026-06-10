import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { CrmLeadsEndpoints } from "@rutba/api-provider/endpoints";
import Link from "next/link";
import LeadForm from "../components/form/LeadForm";
import { LEAD_STATUSES, leadStatusColor } from "../components/leadStatus";

export default function Leads() {
    const { jwt } = useAuth();
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [view, setView] = useState("board");

    const loadLeads = () => {
        if (!jwt) return;
        setLoading(true);
        CrmLeadsEndpoints.list({
            sort: ["createdAt:desc"],
            populate: ["customer", "contact"],
            pageSize: 200,
        })
            .then((res) => setLeads(res.data || []))
            .catch((err) => console.error("Failed to load leads", err))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        loadLeads();
    }, [jwt]);

    const handleStatusChange = async (lead, status) => {
        try {
            await CrmLeadsEndpoints.update(lead.documentId, { status });
            setLeads((prev) =>
                prev.map((l) => (l.documentId === lead.documentId ? { ...l, status } : l)),
            );
        } catch (err) {
            console.error("Failed to update lead status", err);
            alert("Failed to update lead status.");
        }
    };

    const handleDelete = async (lead) => {
        if (!window.confirm(`Delete lead "${lead.name}"?`)) return;
        try {
            await CrmLeadsEndpoints.del(lead.documentId);
            loadLeads();
        } catch (err) {
            console.error("Failed to delete lead", err);
            alert("Failed to delete lead.");
        }
    };

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h2 className="mb-0">Leads</h2>
                    <div>
                        <div className="btn-group me-2">
                            <button
                                className={`btn btn-sm btn-outline-secondary ${view === "board" ? "active" : ""}`}
                                onClick={() => setView("board")}
                            >
                                <i className="fas fa-columns me-1"></i>Board
                            </button>
                            <button
                                className={`btn btn-sm btn-outline-secondary ${view === "table" ? "active" : ""}`}
                                onClick={() => setView("table")}
                            >
                                <i className="fas fa-list me-1"></i>Table
                            </button>
                        </div>
                        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
                            <i className="fas fa-plus me-1"></i>Add Lead
                        </button>
                    </div>
                </div>

                {showForm && (
                    <div className="card mb-4">
                        <div className="card-header d-flex justify-content-between align-items-center">
                            <strong>New Lead</strong>
                            <button className="btn-close" onClick={() => setShowForm(false)}></button>
                        </div>
                        <div className="card-body">
                            <LeadForm
                                onSaved={() => {
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

                {!loading && leads.length > 0 && view === "board" && (
                    <div className="row g-2 flex-nowrap overflow-auto pb-2">
                        {LEAD_STATUSES.map((status) => {
                            const column = leads.filter((l) => (l.status || "New") === status);
                            const total = column.reduce((sum, l) => sum + (Number(l.value) || 0), 0);
                            return (
                                <div className="col-10 col-md-4 col-lg-2" key={status} style={{ minWidth: 220 }}>
                                    <div className="card h-100 bg-light">
                                        <div className={`card-header py-2 border-${leadStatusColor(status)}`}>
                                            <div className="d-flex justify-content-between align-items-center">
                                                <strong className={`text-${leadStatusColor(status)}`}>{status}</strong>
                                                <span className="badge bg-secondary">{column.length}</span>
                                            </div>
                                            {total > 0 && (
                                                <small className="text-muted">{total.toLocaleString()} value</small>
                                            )}
                                        </div>
                                        <div className="card-body p-2 d-flex flex-column gap-2">
                                            {column.length === 0 && (
                                                <small className="text-muted text-center py-2">Empty</small>
                                            )}
                                            {column.map((l) => (
                                                <div className="card shadow-sm" key={l.documentId || l.id}>
                                                    <div className="card-body p-2">
                                                        <Link
                                                            className="fw-semibold d-block text-decoration-none"
                                                            href={`/${l.documentId || l.id}/lead`}
                                                        >
                                                            {l.name}
                                                        </Link>
                                                        {l.company && (
                                                            <small className="text-muted d-block">{l.company}</small>
                                                        )}
                                                        {l.value != null && Number(l.value) > 0 && (
                                                            <small className="d-block">{Number(l.value).toLocaleString()}</small>
                                                        )}
                                                        {l.assigned_to && (
                                                            <small className="text-muted d-block">
                                                                <i className="fas fa-user me-1"></i>
                                                                {l.assigned_to.username || l.assigned_to.email}
                                                            </small>
                                                        )}
                                                        <select
                                                            className="form-select form-select-sm mt-2"
                                                            value={l.status || "New"}
                                                            onChange={(e) => handleStatusChange(l, e.target.value)}
                                                        >
                                                            {LEAD_STATUSES.map((s) => (
                                                                <option key={s} value={s}>{s}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {!loading && leads.length > 0 && view === "table" && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr>
                                    <th>Name</th>
                                    <th>Source</th>
                                    <th>Status</th>
                                    <th>Value</th>
                                    <th>Contact</th>
                                    <th>Customer</th>
                                    <th>Assigned To</th>
                                    <th className="text-end"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {leads.map((l) => (
                                    <tr key={l.documentId || l.id}>
                                        <td>{l.name}</td>
                                        <td>{l.source || "—"}</td>
                                        <td>
                                            <span className={`badge bg-${leadStatusColor(l.status)}`}>
                                                {l.status || "New"}
                                            </span>
                                        </td>
                                        <td>{l.value != null ? Number(l.value).toLocaleString() : "—"}</td>
                                        <td>
                                            {l.contact ? (
                                                <Link href={`/${l.contact.documentId || l.contact.id}/contact`}>
                                                    {l.contact.name}
                                                </Link>
                                            ) : "—"}
                                        </td>
                                        <td>{l.customer?.name || "—"}</td>
                                        <td>{l.assigned_to ? (l.assigned_to.username || l.assigned_to.email) : "—"}</td>
                                        <td className="text-end">
                                            <Link className="btn btn-sm btn-outline-primary me-1" href={`/${l.documentId || l.id}/lead`}>
                                                View
                                            </Link>
                                            <button
                                                className="btn btn-sm btn-outline-danger"
                                                onClick={() => handleDelete(l)}
                                            >
                                                <i className="fas fa-trash"></i>
                                            </button>
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
