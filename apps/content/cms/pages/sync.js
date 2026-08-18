import { useState, useEffect, useCallback, useRef } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/shared/components/ProtectedRoute";
import { useAuth } from "@rutba/shared/context/AuthContext";
import { ContentSyncEndpoints } from "@rutba/api-provider/endpoints";
import { useToast } from "../components/Toast";

const POLL_MS = 2000;

const STATUS_STYLE = {
    running: "bg-primary",
    success: "bg-success",
    partial: "bg-warning text-dark",
    paused: "bg-secondary",
    cancelled: "bg-secondary",
    error: "bg-danger",
    pending: "bg-light text-dark",
    skipped: "bg-light text-dark",
};

/**
 * Manual trigger for pushing CMS content to the paired public site.
 *
 * The worker syncs on its own schedule; this is the "go now" button for when an
 * editor has just finished a change and doesn't want to wait for the next run.
 */
export default function SyncPage() {
    const { jwt } = useAuth();
    const { toast, ToastContainer } = useToast();

    const [config, setConfig] = useState(null);
    const [loading, setLoading] = useState(true);
    const [starting, setStarting] = useState(false);
    const [job, setJob] = useState(null);
    const [includeMedia, setIncludeMedia] = useState(true);
    const pollRef = useRef(null);

    const loadConfig = useCallback(async () => {
        if (!jwt) return;
        try {
            const res = await ContentSyncEndpoints.getSyncConfig();
            setConfig(res?.data || res);
        } catch (err) {
            console.error("Failed to load sync config", err);
            toast(err?.response?.data?.error?.message || "Could not read the sync configuration.", "danger");
        } finally {
            setLoading(false);
        }
    }, [jwt]);

    useEffect(() => { loadConfig(); }, [loadConfig]);

    // Poll while a job is live. Cleared on unmount so a navigation away doesn't
    // leave an interval running against a stale job id.
    useEffect(() => {
        if (!job?.jobId || !["running", "paused"].includes(job.status)) return undefined;

        pollRef.current = setInterval(async () => {
            try {
                const res = await ContentSyncEndpoints.getSyncStatus(job.jobId);
                const next = res?.data || res;
                setJob((prev) => ({ ...prev, ...next }));
                if (!["running", "paused"].includes(next?.status)) {
                    clearInterval(pollRef.current);
                    toast(
                        next?.status === "success" ? "Sync finished." : `Sync ${next?.status}.`,
                        next?.status === "success" ? "success" : "warning"
                    );
                }
            } catch (err) {
                console.error("Failed to poll sync status", err);
                clearInterval(pollRef.current);
            }
        }, POLL_MS);

        return () => clearInterval(pollRef.current);
    }, [job?.jobId, job?.status]);

    const handleRun = async (direction) => {
        setStarting(true);
        try {
            const res = await ContentSyncEndpoints.syncRun({ direction, includeMedia });
            const started = res?.data || res;
            setJob(started);
            toast(`${direction === "push" ? "Push" : "Pull"} started.`, "success");
        } catch (err) {
            console.error("Failed to start sync", err);
            toast(err?.response?.data?.error?.message || "Failed to start the sync.", "danger");
        } finally {
            setStarting(false);
        }
    };

    const handleCancel = async () => {
        if (!job?.jobId) return;
        try {
            const res = await ContentSyncEndpoints.syncCancel(job.jobId);
            setJob((prev) => ({ ...prev, ...(res?.data || res) }));
            toast("Cancellation requested — the current page finishes first.", "warning");
        } catch (err) {
            toast("Failed to cancel.", "danger");
        }
    };

    const isLive = job && ["running", "paused"].includes(job.status);
    const notConfigured = config && !config.configured;
    const nothingEnabled = config && (config.enabled || []).length === 0;
    const canRun = !starting && !isLive && !notConfigured && !nothingEnabled;

    const done = job?.chunks?.filter(c => ["success", "skipped", "error"].includes(c.status)).length || 0;
    const total = job?.total || 0;
    const pct = total ? Math.round((done / total) * 100) : 0;

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <div className="d-flex align-items-center mb-3">
                    <h2 className="mb-0"><i className="fas fa-rotate me-2"></i>Sync to Live Site</h2>
                </div>

                {loading && <p>Loading…</p>}

                {!loading && notConfigured && (
                    <div className="alert alert-warning">
                        <strong>No paired site configured.</strong> Set the remote base URL, API token and
                        shared secret in the Content Sync Pro panel in Strapi admin before syncing.
                    </div>
                )}

                {!loading && !notConfigured && nothingEnabled && (
                    <div className="alert alert-warning">
                        <strong>No content types are enabled for sync.</strong> Enable them in the Content
                        Sync Pro panel (Content Types tab) — this button syncs exactly what is enabled there,
                        so there is no second place to keep in step.
                    </div>
                )}

                {!loading && config && (
                    <div className="row">
                        <div className="col-md-7">
                            <div className="card mb-3">
                                <div className="card-header"><i className="fas fa-play me-2"></i>Run now</div>
                                <div className="card-body">
                                    <p className="text-muted small">
                                        The worker syncs on its own schedule. Use this when you have just
                                        finished an edit and want it live immediately.
                                    </p>

                                    <div className="form-check mb-3">
                                        <input
                                            className="form-check-input"
                                            type="checkbox"
                                            id="includeMedia"
                                            checked={includeMedia}
                                            onChange={e => setIncludeMedia(e.target.checked)}
                                            disabled={isLive}
                                        />
                                        <label className="form-check-label" htmlFor="includeMedia">
                                            Include media (images and their links)
                                        </label>
                                    </div>

                                    <div className="d-flex gap-2">
                                        <button
                                            className="btn btn-primary"
                                            onClick={() => handleRun("push")}
                                            disabled={!canRun}
                                        >
                                            {starting || isLive
                                                ? <><span className="spinner-border spinner-border-sm me-2"></span>Working…</>
                                                : <><i className="fas fa-cloud-arrow-up me-1"></i>Push to live site</>}
                                        </button>
                                        <button
                                            className="btn btn-outline-secondary"
                                            onClick={() => handleRun("pull")}
                                            disabled={!canRun}
                                            title="Bring content from the live site back to this instance"
                                        >
                                            <i className="fas fa-cloud-arrow-down me-1"></i>Pull from live site
                                        </button>
                                        {isLive && (
                                            <button className="btn btn-outline-danger ms-auto" onClick={handleCancel}>
                                                Cancel
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {job && (
                                <div className="card mb-3">
                                    <div className="card-header d-flex align-items-center justify-content-between">
                                        <span><i className="fas fa-list-check me-2"></i>Progress</span>
                                        <span className={`badge ${STATUS_STYLE[job.status] || "bg-secondary"}`}>
                                            {job.status}
                                        </span>
                                    </div>
                                    <div className="card-body">
                                        <div className="progress mb-3" style={{ height: 8 }}>
                                            <div
                                                className="progress-bar"
                                                role="progressbar"
                                                style={{ width: `${pct}%` }}
                                                aria-valuenow={pct}
                                                aria-valuemin={0}
                                                aria-valuemax={100}
                                            />
                                        </div>
                                        <div className="small text-muted mb-2">{done} of {total} steps</div>

                                        {job.chunks && (
                                            <div className="table-responsive" style={{ maxHeight: 320, overflowY: "auto" }}>
                                                <table className="table table-sm mb-0">
                                                    <tbody>
                                                        {job.chunks.map(c => (
                                                            <tr key={c.index}>
                                                                <td className="small">{c.label}</td>
                                                                <td className="text-end small text-muted">
                                                                    {c.pushed || c.pulled
                                                                        ? `${c.pushed ? `${c.pushed}↑` : ""}${c.pulled ? ` ${c.pulled}↓` : ""}`
                                                                        : ""}
                                                                    {c.errors ? <span className="text-danger ms-1">{c.errors} err</span> : null}
                                                                </td>
                                                                <td className="text-end" style={{ width: 90 }}>
                                                                    <span className={`badge ${STATUS_STYLE[c.status] || "bg-light text-dark"}`}>
                                                                        {c.status}
                                                                    </span>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}

                                        {job.errors?.length > 0 && (
                                            <div className="alert alert-danger mt-3 mb-0 small">
                                                {job.errors.map((e, i) => (
                                                    <div key={i}><strong>{e.label}:</strong> {e.error}</div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="col-md-5">
                            <div className="card mb-3">
                                <div className="card-header"><i className="fas fa-layer-group me-2"></i>What gets synced</div>
                                <div className="card-body">
                                    {config.remoteBaseUrl && (
                                        <p className="small mb-2">
                                            Paired with <code>{config.remoteBaseUrl}</code>
                                        </p>
                                    )}
                                    {(config.enabled || []).length === 0 ? (
                                        <p className="text-muted mb-0 small">Nothing enabled yet.</p>
                                    ) : (
                                        <ul className="list-unstyled mb-0 small">
                                            {config.enabled.map(ct => (
                                                <li key={ct.uid} className="mb-1">
                                                    <i className="fas fa-check text-success me-2"></i>
                                                    {ct.displayName}
                                                    <span className="text-muted ms-1">({ct.direction})</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>
                            <div className="alert alert-light border small">
                                Scope and direction are configured in the Content Sync Pro panel in Strapi
                                admin. This page only triggers a run — it deliberately holds no settings of
                                its own, so there is one source of truth.
                            </div>
                        </div>
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() {
    return { props: {} };
}
