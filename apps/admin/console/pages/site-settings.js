import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/shared/components/ProtectedRoute";
import AppAccessGate from "../components/AppAccessGate";
import PermissionCheck from "@rutba/shared/components/PermissionCheck";
import { SiteSettingEndpoints } from "@rutba/api-provider/endpoints";
import { useToast } from "../components/Toast";

/**
 * Site settings list — one row per app.
 *
 * Site settings are a collection resolved by `app_slug`, with a single row
 * flagged `is_default` as the fallback for any request that doesn't match a
 * slug. This page lists the rows and hands off to the per-row editor; the
 * fuller CMS-oriented editor still lives in apps/content/cms.
 */
export default function SiteSettingsPage() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const { toast, ToastContainer } = useToast();

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const res = await SiteSettingEndpoints.list({});
            setRows(res?.data || res || []);
        } catch (err) {
            console.error("Failed to load site settings", err);
            setError("Failed to load site settings.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    async function handleMakeDefault(row) {
        try {
            // A single write, not an unflag-then-flag dance: the site-setting
            // lifecycle clears is_default on every other row when one sets it,
            // which is what keeps "exactly one default" true.
            await SiteSettingEndpoints.updateDraft(row.documentId, { data: { is_default: true } });
            toast(`“${row.site_name || row.app_slug}” is now the default.`, "success");
            load();
        } catch (err) {
            console.error("Failed to set default", err);
            toast("Failed to set default.", "danger");
        }
    }

    async function handleDelete(row) {
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
    }

    return (
        <Layout>
            <ProtectedRoute>
                <AppAccessGate>
                <PermissionCheck adminOnly appKey="admin" required="admin">
                <ToastContainer />
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h2><i className="fas fa-sliders me-2"></i>Site Settings</h2>
                    <Link href="/new/site-setting" className="btn btn-primary">
                        <i className="fas fa-plus me-1"></i>New Entry
                    </Link>
                </div>

                <div className="alert alert-info">
                    Each app resolves its own row by <strong>app slug</strong>, sent as the
                    <code className="mx-1">X-Rutba-App</code> header. When no row matches, the row marked
                    <span className="badge bg-primary mx-1">Default</span> is used.
                    <br />
                    <strong>The storefront asks as <code>web</code></strong> — so its analytics ids belong on the
                    <code className="mx-1">web</code> row, or on the default row if there is no <code>web</code> row.
                    Setting them on the <code>admin</code> row changes nothing on the storefront.
                </div>

                {error && <div className="alert alert-danger">{error}</div>}

                {loading ? (
                    <p>Loading...</p>
                ) : (
                    <div className="table-responsive">
                        <table className="table table-hover align-middle">
                            <thead className="table-dark">
                                <tr>
                                    <th>App Slug</th>
                                    <th>Site Name</th>
                                    <th>Site URL</th>
                                    <th>Tracking</th>
                                    <th className="text-center">Default</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.length === 0 && (
                                    <tr>
                                        <td colSpan="6" className="text-center text-muted py-4">
                                            No site settings yet.{" "}
                                            <Link href="/new/site-setting">Create the first one</Link>.
                                        </td>
                                    </tr>
                                )}
                                {rows.map((row) => (
                                    <tr key={row.documentId}>
                                        <td>
                                            {row.app_slug
                                                ? <code>{row.app_slug}</code>
                                                : <span className="text-muted small">— unkeyed —</span>}
                                        </td>
                                        <td>{row.site_name || <span className="text-muted">(unnamed)</span>}</td>
                                        <td className="small text-muted">{row.site_url || "—"}</td>
                                        <td>
                                            <TrackingBadges row={row} />
                                        </td>
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
                </PermissionCheck>
                </AppAccessGate>
            </ProtectedRoute>
        </Layout>
    );
}

/** At-a-glance "is anything tracking on this row" — the list's whole reason to show it. */
function TrackingBadges({ row }) {
    const set = [
        ["GA4", row.ga_measurement_id],
        ["GTM", row.gtm_container_id],
        ["Pixel", row.meta_pixel_id],
    ].filter(([, v]) => (v || "").trim());

    if (!set.length) return <span className="text-muted small">—</span>;
    return (
        <>
            {set.map(([label]) => (
                <span key={label} className="badge bg-light text-dark border me-1">{label}</span>
            ))}
        </>
    );
}

export async function getServerSideProps() {
    return { props: {} };
}
