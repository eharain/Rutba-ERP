import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";
import Link from "next/link";

const PAGE_TYPES = ["page", "blog", "announcement"];

function getTypeBadgeClass(type) {
    switch (type) {
        case "blog": return "bg-info";
        case "announcement": return "bg-warning text-dark";
        case "page": return "bg-primary";
        default: return "bg-secondary";
    }
}

export default function Pages() {
    const { jwt } = useAuth();
    const [pages, setPages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [typeFilter, setTypeFilter] = useState("");

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const params = {
                sort: ["sort_order:asc", "createdAt:desc"],
                populate: ["featured_image"],
                pagination: { pageSize: 50 },
            };
            const filters = {};
            if (search.trim()) filters.title = { $containsi: search.trim() };
            if (typeFilter) filters.page_type = { $eq: typeFilter };
            if (Object.keys(filters).length > 0) params.filters = filters;

            const res = await authApi.get("/cms-pages", params);
            setPages(res.data || []);
        } catch (err) {
            console.error("Failed to load pages", err);
        } finally {
            setLoading(false);
        }
    }, [jwt, search, typeFilter]);

    useEffect(() => { load(); }, [load]);

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex align-items-center justify-content-between mb-3">
                    <h2 className="mb-0">Pages</h2>
                    <Link className="btn btn-primary btn-sm" href="/new/cms-page">
                        <i className="fas fa-plus me-1"></i>New Page
                    </Link>
                </div>

                <div className="row g-2 mb-3">
                    <div className="col-md-4">
                        <input
                            type="text"
                            className="form-control form-control-sm"
                            placeholder="Search pages…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    <div className="col-auto">
                        <select className="form-select form-select-sm" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                            <option value="">All types</option>
                            {PAGE_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                        </select>
                    </div>
                </div>

                {loading && <p>Loading pages...</p>}

                {!loading && pages.length === 0 && (
                    <div className="alert alert-info">No pages found. Create your first page!</div>
                )}

                {!loading && pages.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr>
                                    <th>Title</th>
                                    <th>Slug</th>
                                    <th>Type</th>
                                    <th>Order</th>
                                    <th>Published</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {pages.map(p => (
                                    <tr key={p.id}>
                                        <td>{p.title}</td>
                                        <td><code>{p.slug}</code></td>
                                        <td><span className={`badge ${getTypeBadgeClass(p.page_type)}`}>{p.page_type}</span></td>
                                        <td>{p.sort_order}</td>
                                        <td>
                                            {p.publishedAt
                                                ? <span className="badge bg-success">Published</span>
                                                : <span className="badge bg-secondary">Draft</span>
                                            }
                                        </td>
                                        <td>
                                            <Link className="btn btn-sm btn-outline-primary" href={`/${p.documentId}/cms-page`}>
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
