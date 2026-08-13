import { useEffect, useState } from "react";
import EnumSelect from "@rutba/pos-shared/components/EnumSelect";
import { useEnumValues } from "@rutba/pos-shared/lib/use-enum-values";
import { NotificationPreferencesEndpoints } from "@rutba/api-provider/endpoints";

const humanize = (s) => String(s).replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Per-user notification preference grid: one row per category (from the
 * enums API — never hardcoded), in-app/email toggles and minimum priority.
 * Rows are created lazily server-side (create = upsert by user+category);
 * a category without a row shows its schema defaults.
 */
export default function UserNotificationPrefs({ userId }) {
    const { values: categories } = useEnumValues("notification-preference", "category");
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyCat, setBusyCat] = useState(null);
    const [error, setError] = useState("");

    const uid = Number(userId);

    useEffect(() => { if (uid) load(); }, [uid]);

    async function load() {
        setLoading(true);
        setError("");
        try {
            const res = await NotificationPreferencesEndpoints.list({ userId: uid });
            setRows(res?.data || []);
        } catch (err) {
            setError(err?.response?.data?.message || err.message || "Failed to load preferences");
        } finally {
            setLoading(false);
        }
    }

    const rowFor = (category) =>
        rows.find((r) => r.category === category)
        || { category, in_app_enabled: true, email_enabled: true, minimum_priority: "medium" };

    async function save(category, patch) {
        setBusyCat(category);
        setError("");
        try {
            const current = rowFor(category);
            await NotificationPreferencesEndpoints.create({
                user: uid,
                category,
                in_app_enabled: current.in_app_enabled,
                email_enabled: current.email_enabled,
                minimum_priority: current.minimum_priority,
                ...patch,
            });
            await load();
        } catch (err) {
            setError(err?.response?.data?.message || err.message || "Failed to save");
        } finally {
            setBusyCat(null);
        }
    }

    return (
        <div className="card mb-4">
            <div className="card-header bg-light">
                <h5 className="mb-0"><i className="fas fa-bell me-2"></i>Notification Preferences</h5>
            </div>
            <div className="card-body">
                {error && <div className="alert alert-danger py-2">{error}</div>}
                {loading ? (
                    <p className="text-muted mb-0">Loading...</p>
                ) : (
                    <div className="table-responsive">
                        <table className="table table-sm align-middle mb-0">
                            <thead className="table-light">
                                <tr>
                                    <th>Category</th>
                                    <th className="text-center" style={{ width: 110 }}>In-app</th>
                                    <th className="text-center" style={{ width: 110 }}>Email</th>
                                    <th style={{ width: 180 }}>Minimum priority</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(categories || []).map((category) => {
                                    const row = rowFor(category);
                                    const busy = busyCat === category;
                                    return (
                                        <tr key={category} className={busy ? "opacity-50" : ""}>
                                            <td>{humanize(category)}</td>
                                            <td className="text-center">
                                                <div className="form-check form-switch d-inline-block">
                                                    <input
                                                        className="form-check-input"
                                                        type="checkbox"
                                                        checked={row.in_app_enabled !== false}
                                                        disabled={busy}
                                                        onChange={(e) => save(category, { in_app_enabled: e.target.checked })}
                                                    />
                                                </div>
                                            </td>
                                            <td className="text-center">
                                                <div className="form-check form-switch d-inline-block">
                                                    <input
                                                        className="form-check-input"
                                                        type="checkbox"
                                                        checked={row.email_enabled !== false}
                                                        disabled={busy}
                                                        onChange={(e) => save(category, { email_enabled: e.target.checked })}
                                                    />
                                                </div>
                                            </td>
                                            <td>
                                                <EnumSelect
                                                    name="notification-preference"
                                                    field="minimum_priority"
                                                    className="form-select form-select-sm"
                                                    value={row.minimum_priority || "medium"}
                                                    disabled={busy}
                                                    onChange={(e) => save(category, { minimum_priority: e.target.value })}
                                                />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
