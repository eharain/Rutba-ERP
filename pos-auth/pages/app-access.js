import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import AppAccessGate from "../components/AppAccessGate";
import { authApi } from "@rutba/pos-shared/lib/api";

export default function AppAccessPage() {
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    // New entry form
    const [showForm, setShowForm] = useState(false);
    const [newKey, setNewKey] = useState("");
    const [newName, setNewName] = useState("");
    const [newDesc, setNewDesc] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => { loadEntries(); }, []);

    async function loadEntries() {
        setLoading(true);
        try {
            const res = await authApi.get("/app-accesses", { populate: ["users"] });
            setEntries(res?.data || res || []);
        } catch (err) {
            setError("Failed to load app-access entries");
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    async function handleCreate(e) {
        e.preventDefault();
        setError("");
        setSuccess("");
        if (!newKey || !newName) {
            setError("Key and name are required.");
            return;
        }
        setSaving(true);
        try {
            await authApi.post("/app-accesses", {
                data: { key: newKey, name: newName, description: newDesc }
            });
            setNewKey("");
            setNewName("");
            setNewDesc("");
            setShowForm(false);
            setSuccess(`App access "${newKey}" created.`);
            await loadEntries();
        } catch (err) {
            const msg = err?.response?.data?.error?.message || err.message || "Failed to create";
            setError(msg);
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete(entry) {
        if (!confirm(`Delete app access "${entry.key}"? Users with this access will lose it.`)) return;
        setError("");
        setSuccess("");
        try {
            await authApi.del(`/app-accesses/${entry.documentId}`);
            setSuccess(`"${entry.key}" deleted.`);
            await loadEntries();
        } catch (err) {
            setError("Failed to delete: " + (err.message || ""));
        }
    }

    return (
        <Layout>
            <ProtectedRoute>
                <AppAccessGate appKey="auth">
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h2><i className="fas fa-key me-2"></i>App Access</h2>
                    <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
                        <i className={`fas ${showForm ? 'fa-times' : 'fa-plus'} me-1`}></i>
                        {showForm ? 'Cancel' : 'New Entry'}
                    </button>
                </div>

                {error && <div className="alert alert-danger">{error}</div>}
                {success && <div className="alert alert-success">{success}</div>}

                {showForm && (
                    <div className="card mb-4">
                        <div className="card-body">
                            <h5 className="card-title">Create App Access Entry</h5>
                            <form onSubmit={handleCreate}>
                                <div className="row g-3">
                                    <div className="col-md-3">
                                        <label className="form-label">Key *</label>
                                        <input className="form-control" placeholder="e.g. accounting" value={newKey} onChange={e => setNewKey(e.target.value)} required />
                                        <small className="text-muted">Unique identifier, lowercase</small>
                                    </div>
                                    <div className="col-md-4">
                                        <label className="form-label">Name *</label>
                                        <input className="form-control" placeholder="e.g. Accounting" value={newName} onChange={e => setNewName(e.target.value)} required />
                                    </div>
                                    <div className="col-md-5">
                                        <label className="form-label">Description</label>
                                        <input className="form-control" placeholder="What this app does" value={newDesc} onChange={e => setNewDesc(e.target.value)} />
                                    </div>
                                </div>
                                <button type="submit" className="btn btn-success mt-3" disabled={saving}>
                                    {saving ? "Creating..." : "Create"}
                                </button>
                            </form>
                        </div>
                    </div>
                )}

                {loading ? (
                    <p>Loading...</p>
                ) : (
                    <div className="table-responsive">
                        <table className="table table-hover align-middle">
                            <thead className="table-dark">
                                <tr>
                                    <th>Key</th>
                                    <th>Name</th>
                                    <th>Description</th>
                                    <th>Users</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {entries.length === 0 && (
                                    <tr><td colSpan="5" className="text-center text-muted py-4">No app-access entries</td></tr>
                                )}
                                {entries.map(e => (
                                    <tr key={e.id}>
                                        <td><code>{e.key}</code></td>
                                        <td>{e.name}</td>
                                        <td className="text-muted">{e.description || '—'}</td>
                                        <td>
                                            <span className="badge bg-secondary">
                                                {(e.users || []).length} user{(e.users || []).length !== 1 ? 's' : ''}
                                            </span>
                                        </td>
                                        <td>
                                            <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(e)} title="Delete">
                                                <i className="fas fa-trash"></i>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <div className="mt-4 p-3 bg-light rounded">
                    <h6>How it works</h6>
                    <ul className="mb-0 small text-muted">
                        <li>Each entry represents an application in the POS system.</li>
                        <li>Assign entries to users via <strong>Users → Edit → App Access</strong> checkboxes.</li>
                        <li>The <code>key</code> must match the app key in <code>packages/pos-shared/lib/roles.js</code>.</li>
                        <li>After creating a new entry here, add its key to <code>VALID_APP_KEYS</code> and <code>APP_URLS</code> in <code>roles.js</code>.</li>
                    </ul>
                </div>
                    </AppAccessGate>
                </ProtectedRoute>
            </Layout>
    );
}

export async function getServerSideProps() { return { props: {} }; }
