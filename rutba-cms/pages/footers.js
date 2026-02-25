import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";
import Link from "next/link";

export default function Footers() {
    const { jwt } = useAuth();
    const [footers, setFooters] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const res = await authApi.get("/cms-footers", {
                sort: ["createdAt:desc"],
                pagination: { pageSize: 50 },
            });
            setFooters(res.data || []);
        } catch (err) {
            console.error("Failed to load footers", err);
        } finally {
            setLoading(false);
        }
    }, [jwt]);

    useEffect(() => { load(); }, [load]);

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex align-items-center justify-content-between mb-3">
                    <h2 className="mb-0">Footers</h2>
                    <Link className="btn btn-primary btn-sm" href="/new/cms-footer">
                        <i className="fas fa-plus me-1"></i>New Footer
                    </Link>
                </div>

                <p className="text-muted small mb-3">
                    Footer configurations contain contact info, opening hours, social links and pinned page links. Attach a footer to a CMS page to display it on the website.
                </p>

                {loading && <p>Loading footers...</p>}
                {!loading && footers.length === 0 && <div className="alert alert-info">No footers found.</div>}

                {!loading && footers.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr>
                                    <th>Name</th>
                                    <th>Slug</th>
                                    <th>Phone</th>
                                    <th>Published</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {footers.map(f => (
                                    <tr key={f.id}>
                                        <td>{f.name}</td>
                                        <td><code>{f.slug}</code></td>
                                        <td>{f.phone || "—"}</td>
                                        <td>
                                            {f.publishedAt
                                                ? <span className="badge bg-success">Published</span>
                                                : <span className="badge bg-secondary">Draft</span>
                                            }
                                        </td>
                                        <td>
                                            <Link className="btn btn-sm btn-outline-primary" href={`/${f.documentId}/cms-footer`}>
                                                Edit
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

export async function getServerSideProps() { return { props: {} }; }
