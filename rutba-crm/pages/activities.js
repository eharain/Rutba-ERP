import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { CrmActivitiesEndpoints } from "@rutba/api-provider/endpoints";
import Link from "next/link";
import ActivityForm from "../components/form/ActivityForm";

const TYPES = ["Call", "Email", "Meeting", "Note", "Follow-up"];
const PAGE_SIZE = 25;

export default function Activities() {
    const { jwt } = useAuth();
    const [activities, setActivities] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [typeFilter, setTypeFilter] = useState("");
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState(null);

    const loadActivities = () => {
        if (!jwt) return;
        setLoading(true);

        const filters = {};
        if (typeFilter) filters.type = { $eq: typeFilter };
        if (fromDate || toDate) {
            filters.date = {
                ...(fromDate ? { $gte: new Date(fromDate).toISOString() } : {}),
                ...(toDate ? { $lte: new Date(`${toDate}T23:59:59`).toISOString() } : {}),
            };
        }

        CrmActivitiesEndpoints.list({
            page,
            pageSize: PAGE_SIZE,
            sort: ["date:desc"],
            populate: ["contact"],
            ...(Object.keys(filters).length ? { filters } : {}),
        })
            .then((res) => {
                setActivities(res.data || []);
                setPagination(res.meta?.pagination || null);
            })
            .catch((err) => console.error("Failed to load activities", err))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        loadActivities();
    }, [jwt, page, typeFilter, fromDate, toDate]);

    const handleDelete = async (activity) => {
        if (!window.confirm(`Delete activity "${activity.subject}"?`)) return;
        try {
            await CrmActivitiesEndpoints.del(activity.documentId);
            loadActivities();
        } catch (err) {
            console.error("Failed to delete activity", err);
            alert("Failed to delete activity.");
        }
    };

    const pageCount = pagination?.pageCount || 1;

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h2 className="mb-0">Activities</h2>
                    <button className="btn btn-primary" onClick={() => setShowForm(true)}>
                        <i className="fas fa-plus me-1"></i>Log Activity
                    </button>
                </div>

                {showForm && (
                    <div className="card mb-4">
                        <div className="card-header d-flex justify-content-between align-items-center">
                            <strong>Log Activity</strong>
                            <button className="btn-close" onClick={() => setShowForm(false)}></button>
                        </div>
                        <div className="card-body">
                            <ActivityForm
                                onSaved={() => {
                                    setShowForm(false);
                                    loadActivities();
                                }}
                                onCancel={() => setShowForm(false)}
                            />
                        </div>
                    </div>
                )}

                <div className="row g-2 mb-3">
                    <div className="col-md-3">
                        <select
                            className="form-select"
                            value={typeFilter}
                            onChange={(e) => { setPage(1); setTypeFilter(e.target.value); }}
                        >
                            <option value="">All types</option>
                            {TYPES.map((t) => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                    </div>
                    <div className="col-md-3">
                        <input
                            className="form-control"
                            type="date"
                            value={fromDate}
                            onChange={(e) => { setPage(1); setFromDate(e.target.value); }}
                        />
                    </div>
                    <div className="col-md-3">
                        <input
                            className="form-control"
                            type="date"
                            value={toDate}
                            onChange={(e) => { setPage(1); setToDate(e.target.value); }}
                        />
                    </div>
                    {(typeFilter || fromDate || toDate) && (
                        <div className="col-auto">
                            <button
                                className="btn btn-outline-secondary"
                                onClick={() => { setPage(1); setTypeFilter(""); setFromDate(""); setToDate(""); }}
                            >
                                Clear filters
                            </button>
                        </div>
                    )}
                </div>

                {loading && <p>Loading activities...</p>}

                {!loading && activities.length === 0 && (
                    <div className="alert alert-info">No activities recorded yet.</div>
                )}

                {!loading && activities.length > 0 && (
                    <>
                        <div className="table-responsive">
                            <table className="table table-striped table-hover">
                                <thead className="table-dark">
                                    <tr>
                                        <th>Date</th>
                                        <th>Type</th>
                                        <th>Subject</th>
                                        <th>Contact</th>
                                        <th className="text-end"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {activities.map((a) => (
                                        <tr key={a.documentId || a.id}>
                                            <td>{new Date(a.date).toLocaleString()}</td>
                                            <td>
                                                <span className="badge bg-secondary">{a.type || "Note"}</span>
                                            </td>
                                            <td>
                                                {a.subject}
                                                {a.description && (
                                                    <div><small className="text-muted">{a.description}</small></div>
                                                )}
                                            </td>
                                            <td>
                                                {a.contact ? (
                                                    <Link href={`/${a.contact.documentId || a.contact.id}/contact`}>
                                                        {a.contact.name}
                                                    </Link>
                                                ) : "—"}
                                            </td>
                                            <td className="text-end">
                                                <button
                                                    className="btn btn-sm btn-outline-danger"
                                                    onClick={() => handleDelete(a)}
                                                >
                                                    <i className="fas fa-trash"></i>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {pageCount > 1 && (
                            <nav className="d-flex justify-content-between align-items-center">
                                <span className="text-muted small">
                                    Page {pagination.page} of {pageCount} ({pagination.total} activities)
                                </span>
                                <div className="btn-group">
                                    <button
                                        className="btn btn-sm btn-outline-secondary"
                                        disabled={page <= 1}
                                        onClick={() => setPage(page - 1)}
                                    >
                                        <i className="fas fa-chevron-left"></i> Prev
                                    </button>
                                    <button
                                        className="btn btn-sm btn-outline-secondary"
                                        disabled={page >= pageCount}
                                        onClick={() => setPage(page + 1)}
                                    >
                                        Next <i className="fas fa-chevron-right"></i>
                                    </button>
                                </div>
                            </nav>
                        )}
                    </>
                )}
            </Layout>
        </ProtectedRoute>
    );
}
