import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { CrmSegmentsEndpoints } from "@rutba/api-provider/endpoints";

const PAGE_SIZE = 50;

export default function Segments() {
    const router = useRouter();
    const { jwt } = useAuth();
    const [segments, setSegments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState("");
    const [busyId, setBusyId] = useState(null);

    const load = () => {
        if (!jwt) return;
        setLoading(true);
        CrmSegmentsEndpoints.list({ pageSize: PAGE_SIZE })
            .then((res) => setSegments(res.data || []))
            .catch((err) => console.error("Failed to load segments", err))
            .finally(() => setLoading(false));
    };

    useEffect(() => { load(); }, [jwt]);

    const create = async (e) => {
        e.preventDefault();
        if (!newName.trim()) return;
        setCreating(true);
        try {
            const res = await CrmSegmentsEndpoints.create({
                name: newName.trim(),
                entity: "person",
                definition: { match: "all", rules: [] },
            });
            const doc = res?.data?.documentId;
            setNewName("");
            if (doc) router.push(`/${doc}/segment`);
            else load();
        } catch (err) {
            console.error("Failed to create segment", err);
            alert("Failed to create the segment.");
        } finally {
            setCreating(false);
        }
    };

    const recount = async (segment) => {
        setBusyId(segment.documentId);
        try {
            await CrmSegmentsEndpoints.recomputeCount(segment.documentId);
            load();
        } catch (err) {
            console.error("Failed to refresh the count", err);
            alert("Failed to refresh the member count.");
        } finally {
            setBusyId(null);
        }
    };

    const remove = async (segment) => {
        if (!window.confirm(`Delete segment "${segment.name}"?`)) return;
        try {
            await CrmSegmentsEndpoints.del(segment.documentId);
            load();
        } catch (err) {
            console.error("Failed to delete segment", err);
            alert("Failed to delete the segment.");
        }
    };

    // Saved segments live in folders, the way RightApp's saved reports did —
    // ungrouped ones fall into a single unfiled bucket.
    const byFolder = segments.reduce((acc, s) => {
        const key = s.folder?.trim() || "Unfiled";
        (acc[key] = acc[key] || []).push(s);
        return acc;
    }, {});

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <div>
                        <h2 className="mb-0">Segments</h2>
                        <small className="text-muted">
                            Saved audiences over people, contacts and leads. Members resolve to a person, so a segment can drive a campaign.
                        </small>
                    </div>
                </div>

                <form className="row g-2 mb-4" onSubmit={create}>
                    <div className="col-md-5">
                        <input
                            className="form-control"
                            placeholder="New segment name — e.g. Lapsed buyers, Karachi"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                        />
                    </div>
                    <div className="col-auto">
                        <button className="btn btn-primary" disabled={creating || !newName.trim()}>
                            <i className="fas fa-plus me-1"></i>{creating ? "Creating…" : "New segment"}
                        </button>
                    </div>
                </form>

                {loading && <p>Loading segments…</p>}

                {!loading && segments.length === 0 && (
                    <div className="alert alert-info">
                        No segments saved yet. Create one above, then add rules in the builder.
                    </div>
                )}

                {!loading && Object.entries(byFolder).map(([folder, rows]) => (
                    <div className="card mb-3" key={folder}>
                        <div className="card-header d-flex justify-content-between">
                            <strong><i className="fas fa-folder me-2 text-muted"></i>{folder}</strong>
                            <span className="badge bg-secondary">{rows.length}</span>
                        </div>
                        <div className="table-responsive">
                            <table className="table table-hover mb-0">
                                <thead className="table-light">
                                    <tr>
                                        <th>Name</th>
                                        <th>Selects</th>
                                        <th className="text-end">Members</th>
                                        <th>Last run</th>
                                        <th className="text-end"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((s) => (
                                        <tr key={s.documentId}>
                                            <td>
                                                <Link href={`/${s.documentId}/segment`}>{s.name}</Link>
                                                {s.description && <div><small className="text-muted">{s.description}</small></div>}
                                            </td>
                                            <td><span className="badge bg-light text-dark border">{s.entity}</span></td>
                                            <td className="text-end">{s.member_count ?? 0}</td>
                                            <td>
                                                <small className="text-muted">
                                                    {s.last_run_at ? new Date(s.last_run_at).toLocaleString() : "never"}
                                                </small>
                                            </td>
                                            <td className="text-end">
                                                <button
                                                    className="btn btn-sm btn-outline-secondary me-2"
                                                    disabled={busyId === s.documentId}
                                                    onClick={() => recount(s)}
                                                    title="Refresh the member count"
                                                >
                                                    <i className="fas fa-rotate"></i>
                                                </button>
                                                <button className="btn btn-sm btn-outline-danger" onClick={() => remove(s)}>
                                                    <i className="fas fa-trash"></i>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ))}
            </Layout>
        </ProtectedRoute>
    );
}
