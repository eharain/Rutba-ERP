import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/shared/components/ProtectedRoute";
import { useAuth } from "@rutba/shared/context/AuthContext";
import { SiteSettingEndpoints } from "@rutba/api-provider/endpoints";
import Link from "next/link";
import { useToast } from "../components/Toast";
import ListPageLayout, { AddButton } from "@rutba/shared/components/ListPageLayout";

/**
 * Site settings list.
 *
 * Site settings used to be a Strapi singleType — one shared record, edited on a
 * single form. It is now a collection with one row per app, resolved by
 * `app_slug` with one row flagged as the default, so this page lists the rows
 * and hands off to the per-row editor.
 */
export default function SiteSettingsPage() {
    const { jwt } = useAuth();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const { toast, ToastContainer } = useToast();

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        try {
            const res = await SiteSettingEndpoints.list({});
            setRows(res?.data || res || []);
        } catch (err) {
            console.error("Failed to load site settings", err);
            toast("Failed to load site settings.", "danger");
        } finally {
            setLoading(false);
        }
    }, [jwt]);

    useEffect(() => { load(); }, [load]);

    const handleMakeDefault = async (row) => {
        try {
            // The server clears the flag on every other row, so this is a
            // single write rather than an unflag-then-flag dance.
            await SiteSettingEndpoints.updateDraft(row.documentId, { data: { is_default: true } });
            toast(`“${row.site_name || row.app_slug}” is now the default.`, "success");
            load();
        } catch (err) {
            console.error("Failed to set default", err);
            toast("Failed to set default.", "danger");
        }
    };

    const handleDelete = async (row) => {
        if (row.is_default) {
            toast("Set another row as the default before deleting this one.", "warning");
            return;
        }
        if (!confirm(`Delete site settings for “${row.app_slug || row.site_name}”?`)) return;
        try {
            await SiteSettingEndpoints.del(row.documentId);
            toast("Deleted.", "success");
            load();
        } catch (err) {
            console.error("Failed to delete", err);
            toast("Failed to delete.", "danger");
        }
    };

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <ListPageLayout
                    title="Site Settings"
                    subtitle="One row per app, resolved by app slug with a single default fallback."
                    loading={loading}
                    headerActions={<AddButton href="/new/site-setting" label="Add Site Settings" />}
                >
                    <div className="alert alert-light border small mb-3">
                        <i className="fas fa-info-circle me-1"></i>
                        Each app resolves its own row by <strong>app slug</strong>. When no row matches,
                        the row marked <span className="badge bg-primary">Default</span> is used — so the
                        default is what an unkeyed request (like the storefront's) gets.
                    </div>

                    {/* ListPageLayout renders its own spinner while `loading`
                        and withholds children, so there is no loading branch here. */}
                    {!loading && rows.length === 0 && (
                        <div className="text-center text-muted py-5">
                            <p className="mb-2">No site settings yet.</p>
                            <Link href="/new/site-setting" className="btn btn-sm btn-primary">
                                Create the first one
                            </Link>
                        </div>
                    )}

                    {!loading && rows.length > 0 && (
                        <div className="table-responsive">
                            <table className="table table-hover align-middle">
                                <thead>
                                    <tr>
                                        <th>App Slug</th>
                                        <th>Site Name</th>
                                        <th>Site URL</th>
                                        <th className="text-center">Default</th>
                                        <th className="text-end">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row) => (
                                        <tr key={row.documentId}>
                                            <td>
                                                {row.app_slug
                                                    ? <code>{row.app_slug}</code>
                                                    : <span className="text-muted small">— unkeyed —</span>}
                                            </td>
                                            <td>{row.site_name || <span className="text-muted">(unnamed)</span>}</td>
                                            <td className="small text-muted">{row.site_url || "—"}</td>
                                            <td className="text-center">
                                                {row.is_default ? (
                                                    <span className="badge bg-primary">Default</span>
                                                ) : (
                                                    <button
                                                        className="btn btn-sm btn-outline-secondary"
                                                        onClick={() => handleMakeDefault(row)}
                                                        title="Use this row when no app slug matches"
                                                    >
                                                        Make default
                                                    </button>
                                                )}
                                            </td>
                                            <td className="text-end">
                                                <Link
                                                    href={`/${row.documentId}/site-setting`}
                                                    className="btn btn-sm btn-outline-primary me-1"
                                                >
                                                    <i className="fas fa-edit me-1"></i>Edit
                                                </Link>
                                                <button
                                                    className="btn btn-sm btn-outline-danger"
                                                    onClick={() => handleDelete(row)}
                                                    disabled={row.is_default}
                                                    title={row.is_default ? "The default row cannot be deleted" : "Delete"}
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
                </ListPageLayout>
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() {
    return { props: {} };
}
