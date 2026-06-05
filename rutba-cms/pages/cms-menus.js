import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { CmsMenusEndpoints } from "@rutba/api-provider/endpoints";
import Link from "next/link";
import { useToast } from "../components/Toast";
import ListPageLayout, { AddButton } from "@rutba/pos-shared/components/ListPageLayout";
import ListPagination from "@rutba/pos-shared/components/ListPagination";

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200];

const POSITION_BADGE = { top: "bg-primary", side: "bg-info text-dark", footer: "bg-secondary" };

export default function CmsMenus() {
    const { jwt } = useAuth();
    const [menus, setMenus] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
    const [total, setTotal] = useState(0);
    const { toast, ToastContainer } = useToast();
    const [publishing, setPublishing] = useState({});

    const setPub = async (docId, publish) => {
        setPublishing(prev => ({ ...prev, [docId]: true }));
        try {
            await (publish ? CmsMenusEndpoints.publish(docId) : CmsMenusEndpoints.unpublish(docId));
            setMenus(prev => prev.map(m => m.documentId === docId ? { ...m, _isPublished: publish } : m));
            toast(publish ? "Published!" : "Unpublished.", "success");
        } catch (err) {
            console.error("Failed to change publish state", err);
            toast("Failed.", "danger");
        } finally {
            setPublishing(prev => ({ ...prev, [docId]: false }));
        }
    };

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const [draftRes, pubRes] = await Promise.all([
                CmsMenusEndpoints.listDraft({ sort: ["position:asc", "name:asc"], populate: { items: { fields: ["documentId"] } }, page, pageSize }),
                CmsMenusEndpoints.listPublished({ pageSize: 200 }),
            ]);
            const pubIds = new Set((pubRes.data || []).map(m => m.documentId));
            setMenus((draftRes.data || []).map(m => ({ ...m, _isPublished: pubIds.has(m.documentId) })));
            setTotal(draftRes.meta?.pagination?.total ?? 0);
        } catch (err) {
            console.error("Failed to load menus", err);
        } finally {
            setLoading(false);
        }
    }, [jwt, page, pageSize]);

    useEffect(() => { load(); }, [load]);

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <ListPageLayout
                    title="Menus"
                    subtitle="CMS-driven navigation. A menu has a position (top / side / footer) and a tree of items. The storefront header renders the top menu and an optional side drawer."
                    headerActions={<AddButton label="New Menu" href="/new/cms-menu" />}
                    loading={loading}
                    pagination={
                        <ListPagination
                            page={page}
                            pageSize={pageSize}
                            total={total}
                            onPage={setPage}
                            onPageSize={(s) => { setPageSize(s); setPage(1); }}
                            pageSizeOptions={PAGE_SIZE_OPTIONS}
                        />
                    }
                    emptyState={<div>No menus found.</div>}
                >
                    {menus.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-hover list-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Slug</th>
                                    <th>Position</th>
                                    <th>Items</th>
                                    <th>Enabled</th>
                                    <th>Published</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {menus.map(m => (
                                    <tr key={m.id}>
                                        <td>{m.name}</td>
                                        <td><code>{m.slug}</code></td>
                                        <td><span className={`badge ${POSITION_BADGE[m.position] || "bg-light text-dark"}`}>{m.position}</span></td>
                                        <td><span className="badge bg-primary">{(m.items || []).length}</span></td>
                                        <td>{m.enabled ? <i className="fas fa-check text-success"></i> : <i className="fas fa-times text-muted"></i>}</td>
                                        <td>
                                            {m._isPublished
                                                ? <button className="list-status btn border-0" style={{ background: '#198754', color: '#fff' }} onClick={() => setPub(m.documentId, false)} disabled={publishing[m.documentId]} title="Click to unpublish">
                                                    {publishing[m.documentId] ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-check me-1"></i>Published</>}
                                                </button>
                                                : <button className="list-status btn border-0" style={{ background: '#e9ecef', color: '#495057' }} onClick={() => setPub(m.documentId, true)} disabled={publishing[m.documentId]} title="Click to publish">
                                                    {publishing[m.documentId] ? <i className="fas fa-spinner fa-spin"></i> : "Draft"}
                                                </button>
                                            }
                                        </td>
                                        <td>
                                            <div className="list-actions">
                                                <Link className="btn btn-outline-primary" href={`/${m.documentId}/cms-menu`}>
                                                    Edit
                                                </Link>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    )}
                </ListPageLayout>
            </Layout>
        </ProtectedRoute>
    );
}
