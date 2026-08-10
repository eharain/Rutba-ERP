import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import EnumSelect from "@rutba/pos-shared/components/EnumSelect";
import {
    CmpCampaignsEndpoints,
    CmpTemplatesEndpoints,
    CmpAudiencesEndpoints,
    CmpSendingIdentitiesEndpoints,
    CmpRunsEndpoints,
} from "@rutba/api-provider/endpoints";

// The composer (Phase 2): info → audience → schedule → review, flattened onto
// one page — every section saves into the same campaign row, so partial
// progress survives (the RMAILX wizard's upd.info/upd.mapping/upd.schedule
// idea without the modal).

export default function CampaignComposerPage() {
    const router = useRouter();
    const { documentId } = router.query;
    const { jwt } = useAuth();

    const [campaign, setCampaign] = useState(null);
    const [templates, setTemplates] = useState([]);
    const [audiences, setAudiences] = useState([]);
    const [identities, setIdentities] = useState([]);
    const [runs, setRuns] = useState([]);
    const [busy, setBusy] = useState(null);
    const [notice, setNotice] = useState(null);

    const load = useCallback(() => {
        if (!jwt || !router.isReady || !documentId) return;
        Promise.all([
            CmpCampaignsEndpoints.byId(documentId, { populate: { template: true, audience: true, sending_identity: true } }),
            CmpTemplatesEndpoints.list({ pageSize: 100 }),
            CmpAudiencesEndpoints.list({ pageSize: 100 }),
            CmpSendingIdentitiesEndpoints.list({ pageSize: 50 }).catch(() => ({ data: [] })),
            CmpRunsEndpoints.list({ campaignDocId: documentId, pageSize: 20 }).catch(() => ({ data: [] })),
        ])
            .then(([c, t, a, i, r]) => {
                setCampaign(c?.data || null);
                setTemplates(t?.data || []);
                setAudiences(a?.data || []);
                setIdentities(i?.data || []);
                setRuns(r?.data || []);
            })
            .catch((err) => setNotice({ type: "danger", text: err.message }));
    }, [jwt, router.isReady, documentId]);

    useEffect(() => { load(); }, [load]);

    const set = (k) => (e) => setCampaign((c) => ({ ...c, [k]: e.target.value }));

    const save = async () => {
        setBusy("save");
        setNotice(null);
        try {
            await CmpCampaignsEndpoints.update(documentId, {
                name: campaign.name,
                subject_override: campaign.subject_override,
                from_name: campaign.from_name,
                utm_source: campaign.utm_source,
                utm_medium: campaign.utm_medium,
                utm_campaign: campaign.utm_campaign,
                utm_content: campaign.utm_content,
                track_opens: campaign.track_opens !== false,
                track_clicks: campaign.track_clicks !== false,
                schedule_frequency: campaign.schedule_frequency,
                schedule_interval: Number(campaign.schedule_interval) || 1,
                start_at: campaign.start_at || null,
                next_run_at: campaign.next_run_at || campaign.start_at || null,
                max_runs: Number(campaign.max_runs) || 0,
                max_failures: Number(campaign.max_failures) || 0,
                status: campaign.status,
                template: campaign.template?.documentId ? { connect: [campaign.template.documentId] } : undefined,
                audience: campaign.audience?.documentId ? { connect: [campaign.audience.documentId] } : undefined,
                sending_identity: campaign.sending_identity?.documentId
                    ? { connect: [campaign.sending_identity.documentId] }
                    : undefined,
            });
            setNotice({ type: "success", text: "Saved." });
            load();
        } catch (err) {
            setNotice({ type: "danger", text: `Save failed: ${err.message}` });
        } finally {
            setBusy(null);
        }
    };

    const runNow = async () => {
        if (!window.confirm("Run this campaign NOW? This submits a real batch to the MTA.")) return;
        setBusy("run");
        try {
            const res = await CmpCampaignsEndpoints.runCampaign(documentId);
            setNotice({ type: "success", text: `Run started — ${res?.run?.total} recipients.` });
            load();
        } catch (err) {
            setNotice({ type: "danger", text: `Run failed: ${err.message}` });
            load();
        } finally {
            setBusy(null);
        }
    };

    const pickRel = (key, list) => (e) => {
        const documentIdValue = e.target.value;
        setCampaign((c) => ({ ...c, [key]: list.find((x) => x.documentId === documentIdValue) || null }));
    };

    if (!campaign) {
        return <ProtectedRoute><Layout><p className="text-muted">Loading…</p></Layout></ProtectedRoute>;
    }

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h2 className="mb-0">
                        <Link href="/campaigns" className="text-decoration-none"><i className="fa-solid fa-arrow-left me-2"></i></Link>
                        {campaign.name}
                        <span className="badge bg-secondary ms-2">{campaign.status}</span>
                    </h2>
                    <div>
                        <button className="btn btn-outline-primary me-2" disabled={busy !== null} onClick={runNow}>
                            {busy === "run" ? "Starting…" : "Run now"}
                        </button>
                        <button className="btn btn-primary" disabled={busy !== null} onClick={save}>
                            {busy === "save" ? "Saving…" : "Save"}
                        </button>
                    </div>
                </div>

                {notice && (
                    <div className={`alert alert-${notice.type} alert-dismissible`}>
                        {notice.text}
                        <button type="button" className="btn-close" onClick={() => setNotice(null)}></button>
                    </div>
                )}

                <div className="card mb-3">
                    <div className="card-header py-2"><strong>1 — Message</strong></div>
                    <div className="card-body row g-2">
                        <div className="col-md-3">
                            <label className="form-label">Name</label>
                            <input className="form-control" value={campaign.name || ""} onChange={set("name")} />
                        </div>
                        <div className="col-md-3">
                            <label className="form-label">Template</label>
                            <select className="form-select" value={campaign.template?.documentId || ""}
                                onChange={pickRel("template", templates)}>
                                <option value="">— choose —</option>
                                {templates.map((t) => <option key={t.documentId} value={t.documentId}>{t.name}</option>)}
                            </select>
                        </div>
                        <div className="col-md-3">
                            <label className="form-label">Subject override <span className="text-muted">(blank = template subject)</span></label>
                            <input className="form-control" value={campaign.subject_override || ""} onChange={set("subject_override")} />
                        </div>
                        <div className="col-md-3">
                            <label className="form-label">Sending identity <span className="text-muted">(blank = default)</span></label>
                            <select className="form-select" value={campaign.sending_identity?.documentId || ""}
                                onChange={pickRel("sending_identity", identities)}>
                                <option value="">— default —</option>
                                {identities.map((i) => <option key={i.documentId} value={i.documentId}>{i.name}</option>)}
                            </select>
                        </div>
                        <div className="col-md-3">
                            <label className="form-label">UTM source</label>
                            <input className="form-control" value={campaign.utm_source || ""} onChange={set("utm_source")} />
                        </div>
                        <div className="col-md-3">
                            <label className="form-label">UTM medium</label>
                            <input className="form-control" value={campaign.utm_medium || ""} onChange={set("utm_medium")} />
                        </div>
                        <div className="col-md-3">
                            <label className="form-label">UTM campaign</label>
                            <input className="form-control" value={campaign.utm_campaign || ""} onChange={set("utm_campaign")} />
                        </div>
                        <div className="col-md-3">
                            <label className="form-label">UTM content</label>
                            <input className="form-control" value={campaign.utm_content || ""} onChange={set("utm_content")} />
                        </div>
                        <div className="col-md-3">
                            <div className="form-check mt-2">
                                <input className="form-check-input" type="checkbox" id="track_opens"
                                    checked={campaign.track_opens !== false}
                                    onChange={(e) => setCampaign((c) => ({ ...c, track_opens: e.target.checked }))} />
                                <label className="form-check-label" htmlFor="track_opens">Track opens</label>
                            </div>
                            <div className="form-check">
                                <input className="form-check-input" type="checkbox" id="track_clicks"
                                    checked={campaign.track_clicks !== false}
                                    onChange={(e) => setCampaign((c) => ({ ...c, track_clicks: e.target.checked }))} />
                                <label className="form-check-label" htmlFor="track_clicks">Track link clicks</label>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="card mb-3">
                    <div className="card-header py-2"><strong>2 — Audience</strong></div>
                    <div className="card-body row g-2 align-items-end">
                        <div className="col-md-4">
                            <label className="form-label">Audience</label>
                            <select className="form-select" value={campaign.audience?.documentId || ""}
                                onChange={pickRel("audience", audiences)}>
                                <option value="">— choose —</option>
                                {audiences.map((a) => (
                                    <option key={a.documentId} value={a.documentId}>
                                        {a.name} ({a.member_count ?? "?"})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="col-md-8 text-muted small">
                            {campaign.audience
                                ? <>Last resolved: {campaign.audience.last_resolved_at ? new Date(campaign.audience.last_resolved_at).toLocaleString() : "never"} — <Link href={`/audiences/${campaign.audience.documentId}`}>edit audience</Link></>
                                : "Pick who this goes to. The runner re-resolves at send time."}
                        </div>
                    </div>
                </div>

                <div className="card mb-3">
                    <div className="card-header py-2"><strong>3 — Schedule</strong></div>
                    <div className="card-body row g-2">
                        <div className="col-md-2">
                            <label className="form-label">Frequency</label>
                            <EnumSelect name="cmp-campaign" field="schedule_frequency" value={campaign.schedule_frequency || "once"}
                                onChange={set("schedule_frequency")} />
                        </div>
                        <div className="col-md-2">
                            <label className="form-label">Interval</label>
                            <input className="form-control" type="number" min={1} value={campaign.schedule_interval || 1}
                                onChange={set("schedule_interval")} />
                        </div>
                        <div className="col-md-3">
                            <label className="form-label">Start at</label>
                            <input className="form-control" type="datetime-local"
                                value={campaign.start_at ? String(campaign.start_at).slice(0, 16) : ""}
                                onChange={set("start_at")} />
                        </div>
                        <div className="col-md-2">
                            <label className="form-label">Max runs <span className="text-muted">(0 = ∞)</span></label>
                            <input className="form-control" type="number" min={0} value={campaign.max_runs || 0}
                                onChange={set("max_runs")} />
                        </div>
                        <div className="col-md-2">
                            <label className="form-label">Status</label>
                            <EnumSelect name="cmp-campaign" field="status" value={campaign.status}
                                onChange={set("status")} />
                        </div>
                        <div className="col-12 text-muted small">
                            Set status to <strong>Scheduled</strong> with a start time and the cron sweep
                            picks it up; or use <strong>Run now</strong> for an immediate one-off run.
                        </div>
                    </div>
                </div>

                <div className="card">
                    <div className="card-header py-2"><strong>Runs</strong></div>
                    {runs.length === 0 ? (
                        <div className="card-body text-muted">No runs yet.</div>
                    ) : (
                        <div className="table-responsive">
                            <table className="table table-sm align-middle mb-0">
                                <thead><tr><th>Started</th><th>State</th><th>Total</th><th>Sent</th><th>Bounced</th><th>Error</th><th></th></tr></thead>
                                <tbody>
                                    {runs.map((r) => (
                                        <tr key={r.documentId}>
                                            <td className="small">{r.started_at ? new Date(r.started_at).toLocaleString() : ""}</td>
                                            <td><span className="badge bg-secondary">{r.state}</span></td>
                                            <td>{r.total ?? ""}</td>
                                            <td>{r.sent ?? ""}</td>
                                            <td>{(r.bounced_hard || 0) + (r.bounced_soft || 0) || ""}</td>
                                            <td className="small text-danger text-truncate" style={{ maxWidth: "14rem" }}>{r.error}</td>
                                            <td><Link href={`/runs/${r.documentId}`}>detail</Link></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </Layout>
        </ProtectedRoute>
    );
}
