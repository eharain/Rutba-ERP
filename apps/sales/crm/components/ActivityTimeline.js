import { useState, useEffect, useCallback } from "react";
import { StraipImageUrl } from "@rutba/api-provider/lib/api";
import { CrmActivitiesEndpoints } from "@rutba/api-provider/endpoints";

// Icons are presentation, not data — a type the backend adds that isn't
// listed here still renders, just with the fallback glyph. This is NOT an
// enum list: nothing here constrains what the user can pick (see
// ActivityForm, which reads the values from /enums).
const TYPE_ICON = {
    Call: "fa-phone",
    Email: "fa-envelope",
    Meeting: "fa-handshake",
    Note: "fa-sticky-note",
    "Follow-up": "fa-bell",
    WhatsApp: "fa-comment-dots",
    Site: "fa-globe",
    Comment: "fa-comments",
    Audit: "fa-clock-rotate-left",
};

const SOURCE_STYLE = {
    "crm-activity": "border-start border-3 border-primary",
    "work-item-comment": "border-start border-3 border-info",
    "work-item-activity": "border-start border-3 border-secondary",
};

function fmt(d) {
    if (!d) return "";
    try { return new Date(d).toLocaleString(); } catch { return ""; }
}

function isOverdue(entry) {
    return entry.followup_at && !entry.followup_done_at && new Date(entry.followup_at) < new Date();
}

/**
 * The 360° feed for one CRM subject (CRM plan §5.1).
 *
 * One request, one merged list: typed CRM touches plus the shared work-item
 * collaboration primitive (comments + audit trail) for the same entity. The
 * merge happens server-side in crm-activity.timeline so this component never
 * has to reconcile three paginations.
 *
 * Props: exactly one of contactId / leadId / personId. `onEdit(documentId)`
 * is optional — pass it to expose an edit affordance on the entries that are
 * actually editable (CRM touches; audit rows and comments are not).
 */
export default function ActivityTimeline({ contactId, leadId, personId, jwt, limit = 100, refreshKey, onChanged, onEdit }) {
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filter, setFilter] = useState("all");
    const [busyId, setBusyId] = useState(null);

    const load = useCallback(async () => {
        if (!jwt || !(contactId || leadId || personId)) return;
        setLoading(true);
        setError(null);
        try {
            const res = await CrmActivitiesEndpoints.getTimeline({
                contact: contactId, lead: leadId, person: personId, limit,
            });
            setEntries(res?.data || []);
        } catch (err) {
            console.error("Failed to load timeline", err);
            setError("Could not load the timeline.");
        } finally {
            setLoading(false);
        }
    }, [jwt, contactId, leadId, personId, limit]);

    useEffect(() => { load(); }, [load, refreshKey]);

    const toggleFollowup = async (entry) => {
        setBusyId(entry.id);
        try {
            await CrmActivitiesEndpoints.markFollowupDone(entry.id, { done: !entry.followup_done_at });
            await load();
            onChanged?.();
        } catch (err) {
            console.error("Failed to update follow-up", err);
            alert("Failed to update the follow-up.");
        } finally {
            setBusyId(null);
        }
    };

    const shown = entries.filter((e) => {
        if (filter === "all") return true;
        if (filter === "touches") return e.source === "crm-activity";
        if (filter === "collab") return e.source !== "crm-activity";
        return true;
    });

    const openFollowups = entries.filter((e) => e.followup_at && !e.followup_done_at).length;

    return (
        <div className="card">
            <div className="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
                <strong>
                    Timeline
                    {openFollowups > 0 && (
                        <span className="badge bg-warning text-dark ms-2">
                            {openFollowups} open follow-up{openFollowups === 1 ? "" : "s"}
                        </span>
                    )}
                </strong>
                <div className="btn-group btn-group-sm">
                    {[
                        { key: "all", label: "All" },
                        { key: "touches", label: "Touches" },
                        { key: "collab", label: "Comments & audit" },
                    ].map((f) => (
                        <button
                            key={f.key}
                            type="button"
                            className={`btn ${filter === f.key ? "btn-secondary" : "btn-outline-secondary"}`}
                            onClick={() => setFilter(f.key)}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {loading && <div className="card-body text-muted">Loading timeline…</div>}
            {error && !loading && <div className="card-body text-danger">{error}</div>}

            {!loading && !error && shown.length === 0 && (
                <div className="card-body text-muted">Nothing recorded yet.</div>
            )}

            {!loading && !error && shown.length > 0 && (
                <ul className="list-group list-group-flush">
                    {shown.map((e) => (
                        <li key={`${e.source}:${e.id}`} className={`list-group-item ${SOURCE_STYLE[e.source] || ""}`}>
                            <div className="d-flex justify-content-between align-items-start gap-2">
                                <span>
                                    <i className={`fas ${TYPE_ICON[e.type] || "fa-sticky-note"} me-2 text-muted`}></i>
                                    <strong>{e.subject || e.body?.slice(0, 80) || e.type}</strong>
                                </span>
                                <span className="text-nowrap">
                                    <small className="text-muted">{fmt(e.at)}</small>
                                    {onEdit && e.editable && (
                                        <button
                                            className="btn btn-sm btn-link text-secondary py-0 px-1"
                                            title="Edit this activity"
                                            onClick={() => onEdit(e.id)}
                                        >
                                            <i className="fas fa-pen"></i>
                                        </button>
                                    )}
                                </span>
                            </div>

                            <div className="mt-1 d-flex flex-wrap align-items-center gap-2">
                                <span className="badge bg-secondary">{e.type}</span>
                                {e.direction && e.direction !== "Internal" && (
                                    <span className="badge bg-light text-dark border">
                                        <i className={`fas ${e.direction === "Inbound" ? "fa-arrow-down" : "fa-arrow-up"} me-1`}></i>
                                        {e.direction}
                                    </span>
                                )}
                                {e.outcome && <span className="badge bg-info text-dark">{e.outcome}</span>}
                                {e.duration_minutes != null && (
                                    <span className="badge bg-light text-dark border">{e.duration_minutes} min</span>
                                )}
                                {e.actor_label && <small className="text-muted">by {e.actor_label}</small>}
                            </div>

                            {e.subject && e.body && <div className="mt-1"><small className="text-muted">{e.body}</small></div>}

                            {e.attachments?.length > 0 && (
                                <div className="mt-2 d-flex flex-wrap gap-2">
                                    {e.attachments.map((f) => (
                                        <a
                                            key={f.id}
                                            className="btn btn-sm btn-outline-secondary"
                                            href={StraipImageUrl(f)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            <i className="fas fa-paperclip me-1"></i>{f.name}
                                        </a>
                                    ))}
                                </div>
                            )}

                            {e.source === "work-item-activity" && (e.from_value || e.to_value) && (
                                <div className="mt-1">
                                    <small className="text-muted">
                                        {e.from_value || "—"} <i className="fas fa-arrow-right mx-1"></i> {e.to_value || "—"}
                                    </small>
                                </div>
                            )}

                            {e.followup_at && (
                                <div className="mt-2 d-flex align-items-center gap-2">
                                    <span className={`badge ${e.followup_done_at ? "bg-success" : isOverdue(e) ? "bg-danger" : "bg-warning text-dark"}`}>
                                        <i className="fas fa-bell me-1"></i>
                                        {e.followup_done_at ? "Follow-up done" : `Follow-up ${fmt(e.followup_at)}`}
                                    </span>
                                    <button
                                        className="btn btn-sm btn-outline-secondary"
                                        disabled={busyId === e.id}
                                        onClick={() => toggleFollowup(e)}
                                    >
                                        {e.followup_done_at ? "Reopen" : "Mark done"}
                                    </button>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
