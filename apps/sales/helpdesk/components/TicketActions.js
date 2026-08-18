import { useCallback, useEffect, useState } from "react";
import { HelpdeskTicketsEndpoints, HelpdeskConfigEndpoints } from "@rutba/api-provider/endpoints";
import { useEnumValues } from "@rutba/shared/lib/use-enum-values";

function apiError(err) {
    const res = err && err.response;
    const payload = res && res.data && res.data.error;
    return {
        status: res ? res.status : 0,
        message: (payload && payload.message) || (err && err.message) || "Request failed",
    };
}

function humanise(key) {
    return String(key)
        .split(".")
        .pop()
        .replace(/[-_]+/g, " ")
        .replace(/^\w/, (c) => c.toUpperCase());
}

const LONG_FIELDS = new Set(["resolution", "reason", "note", "notes", "body", "comment", "summary"]);

/**
 * What a move demands before the server will accept it.
 *
 * `move.requires` is the workflow's own list and comes straight from
 * listTransitions. The other three are enforced by
 * ticket.service.assertCanonicalRequirements against the CANONICAL status and
 * are therefore invisible to the workflow — collecting them here is the
 * difference between a transition that works and a 400 after the click.
 */
function requirementsFor(move, ticket, desk) {
    const required = Array.isArray(move.requires) ? [...move.requires] : [];
    const status = move.maps_to_status;
    const reopening = status === "open" && (ticket.status === "resolved" || ticket.status === "closed");

    const need = (key) => {
        if (!required.includes(key)) required.push(key);
    };
    if (status === "cancelled") need("reason");
    if (reopening) need("reason");
    if (status === "resolved" && desk && desk.require_resolution_note) need("resolution");

    const optional = [];
    if (status === "resolved" && !required.includes("resolution")) optional.push("resolution");
    if (!required.includes("reason")) optional.push("reason");

    return { required, optional, status, reopening };
}

function FieldInput({ name, value, required, onChange }) {
    const long = LONG_FIELDS.has(name);
    const id = `hd-field-${name.replace(/\W+/g, "-")}`;
    return (
        <div className="mb-2">
            <label className="form-label small mb-1" htmlFor={id}>
                {humanise(name)}
                {required && <span className="text-danger ms-1" aria-hidden="true">*</span>}
                {required && <span className="visually-hidden"> (required)</span>}
            </label>
            {long ? (
                <textarea
                    id={id}
                    className="form-control form-control-sm"
                    rows={3}
                    value={value || ""}
                    required={required}
                    onChange={(e) => onChange(name, e.target.value)}
                />
            ) : (
                <input
                    id={id}
                    className="form-control form-control-sm"
                    value={value || ""}
                    required={required}
                    onChange={(e) => onChange(name, e.target.value)}
                />
            )}
        </div>
    );
}

function Group({ title, icon, children }) {
    return (
        <div className="mb-3">
            <div className="small text-uppercase text-muted fw-semibold mb-2">
                <i className={`fa-solid ${icon} me-2`}></i>{title}
            </div>
            {children}
        </div>
    );
}

export default function TicketActions({
    documentId,
    ticket,
    desk,
    desks = [],
    canManage = false,
    refreshKey,
    onDone,
    onConflict,
    splitMode = false,
    splitSelection,
    onSplitModeChange,
}) {
    const [transitions, setTransitions] = useState({ rows: [], loading: true, error: null, stale: false });
    const [panel, setPanel] = useState(null);
    const [move, setMove] = useState(null);
    const [form, setForm] = useState({});
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);
    const [availability, setAvailability] = useState({ agents: [], loading: false, error: null });

    const priorities = useEnumValues("contact-ticket", "priority");

    useEffect(() => {
        if (!documentId) return undefined;
        let alive = true;
        setTransitions((s) => ({ ...s, loading: true }));
        HelpdeskTicketsEndpoints.listTransitions(documentId)
            .then((res) => {
                if (!alive) return;
                setTransitions({ rows: Array.isArray(res.data) ? res.data : [], loading: false, error: null, stale: false });
            })
            .catch((err) => {
                if (!alive) return;
                // Stale-data-wins: keep the buttons that were already offered.
                setTransitions((s) => ({ ...s, loading: false, error: apiError(err).message, stale: s.rows.length > 0 }));
            });
        return () => { alive = false; };
    }, [documentId, refreshKey]);

    const openPanel = (next) => {
        setPanel(panel === next ? null : next);
        setMove(null);
        setForm({});
        setError(null);
        setNotice(null);
    };

    const setField = (name, value) => setForm((f) => ({ ...f, [name]: value }));

    const run = useCallback(async (fn, successMessage) => {
        setBusy(true);
        setError(null);
        setNotice(null);
        try {
            const res = await fn();
            setPanel(null);
            setMove(null);
            setForm({});
            setNotice(successMessage || "Done.");
            if (onDone) onDone(res);
        } catch (err) {
            const info = apiError(err);
            setError(info.message);
            // A 409 means someone else moved the ticket under us. Nothing is
            // retried and nothing is overwritten — the page offers a refresh.
            if (info.status === 409 && onConflict) onConflict(info.message);
        } finally {
            setBusy(false);
        }
    }, [onDone, onConflict]);

    // ── transitions ──────────────────────────────────────────────────────────

    const chooseMove = (row) => {
        setMove(row);
        setPanel("transition");
        setForm({});
        setError(null);
        setNotice(null);
    };

    const submitTransition = (e) => {
        e.preventDefault();
        if (!move || !ticket) return;
        const { required, status, reopening } = requirementsFor(move, ticket, desk);
        const missing = required.filter((key) => !String(form[key] || "").trim());
        if (missing.length) {
            setError(`${missing.map(humanise).join(", ")} ${missing.length === 1 ? "is" : "are"} required for this move.`);
            return;
        }

        const payload = {};
        for (const [key, value] of Object.entries(form)) {
            const text = String(value || "").trim();
            if (text) payload[key] = text;
        }

        // The named intents carry their own api-pro action (resolve / close /
        // cancel / reopen), which is what the permission rows are keyed on.
        // `stage_key` pins the exact stage the agent clicked — without it
        // transitionToStatus picks the first move that reaches the status.
        return run(() => {
            if (status === "resolved") {
                return HelpdeskTicketsEndpoints.runResolve(documentId, { ...payload, stage_key: move.to_key });
            }
            if (status === "closed") {
                return HelpdeskTicketsEndpoints.runClose(documentId, { ...payload, stage_key: move.to_key });
            }
            if (status === "cancelled") {
                return HelpdeskTicketsEndpoints.runCancel(documentId, { ...payload, stage_key: move.to_key });
            }
            if (reopening) {
                return HelpdeskTicketsEndpoints.runReopen(documentId, { ...payload, stage_key: move.to_key });
            }
            return HelpdeskTicketsEndpoints.runTransition(documentId, { ...payload, to_stage: move.to_key });
        }, `Moved to ${move.label || move.to_key}.`);
    };

    // ── assignment ───────────────────────────────────────────────────────────

    useEffect(() => {
        if (panel !== "assign" || !canManage || !ticket || !ticket.desk_id) return undefined;
        let alive = true;
        setAvailability({ agents: [], loading: true, error: null });
        HelpdeskConfigEndpoints.getRoutingAvailability({ deskId: ticket.desk_id })
            .then((res) => {
                if (!alive) return;
                const payload = res && res.data ? res.data : null;
                setAvailability({ agents: (payload && payload.agents) || [], loading: false, error: null });
            })
            .catch((err) => {
                if (!alive) return;
                // Not fatal: the id field below still assigns without the roster.
                setAvailability({ agents: [], loading: false, error: apiError(err).message });
            });
        return () => { alive = false; };
    }, [panel, canManage, ticket]);

    const submitAssign = (e) => {
        e.preventDefault();
        const assignee = String(form.assignee_id || "").trim();
        if (!assignee) {
            setError("Choose an agent to assign to.");
            return;
        }
        return run(
            () => HelpdeskTicketsEndpoints.assignTicket(documentId, {
                assignee_id: Number(assignee),
                reason: String(form.reason || "").trim() || undefined,
            }),
            "Assigned."
        );
    };

    // ── merge ────────────────────────────────────────────────────────────────

    const submitMerge = (e) => {
        e.preventDefault();
        const targetNo = String(form.target_no || "").trim();
        if (!targetNo) {
            setError("Enter the ticket number to merge into.");
            return;
        }
        return run(async () => {
            // merge takes a documentId; agents work in ticket numbers. Resolving
            // through byNumber also means a merged number still finds its target.
            const found = await HelpdeskTicketsEndpoints.byNumber(targetNo);
            const target = found && found.data;
            if (!target || !target.documentId) throw new Error(`No ticket numbered ${targetNo}`);
            return HelpdeskTicketsEndpoints.mergeTicket(documentId, {
                target_document_id: target.redirect_to || target.documentId,
                reason: String(form.reason || "").trim() || undefined,
                confirm: Boolean(form.confirm),
            });
        }, `Merged into ${targetNo}.`);
    };

    // ── split ────────────────────────────────────────────────────────────────

    const selectedIds = splitSelection ? Array.from(splitSelection) : [];

    const submitSplit = (e) => {
        e.preventDefault();
        if (!selectedIds.length) {
            setError("Tick the messages in the conversation that should move to the new ticket.");
            return;
        }
        return run(
            () => HelpdeskTicketsEndpoints.runSplit(documentId, {
                message_document_ids: selectedIds,
                subject: String(form.subject || "").trim() || undefined,
                body: String(form.body || "").trim() || undefined,
            }),
            "Split into a new ticket."
        );
    };

    // ── subject link ─────────────────────────────────────────────────────────

    const submitSubject = (e) => {
        e.preventDefault();
        const uid = String(form.entity_uid || "").trim();
        const doc = String(form.document_id || "").trim();
        if (!uid || !doc) {
            setError("Both the entity uid and the record's documentId are required.");
            return;
        }
        // The handler reads `entity_uid` / `document_id`, NOT the
        // subject_entity_uid / subject_document_id names the descriptor's
        // docblock mentions — those are the column names, not the wire fields.
        return run(
            () => HelpdeskTicketsEndpoints.setSubject(documentId, { entity_uid: uid, document_id: doc }),
            "Record linked."
        );
    };

    const clearSubject = () => run(
        () => HelpdeskTicketsEndpoints.setSubject(documentId, { entity_uid: null }),
        "Link removed."
    );

    // ── SLA ──────────────────────────────────────────────────────────────────

    const submitExtendSla = (e) => {
        e.preventDefault();
        const dueAt = String(form.due_at || "").trim();
        const reason = String(form.reason || "").trim();
        // The server refuses an extension without a reason, by design — an SLA
        // is a promise being changed, so the reason is collected here first.
        if (!dueAt || !reason) {
            setError("A new due time and a reason are both required.");
            return;
        }
        return run(
            () => HelpdeskTicketsEndpoints.runExtendSla(documentId, {
                due_at: new Date(dueAt).toISOString(),
                reason,
                clock: form.clock === "first_response" ? "first_response" : "resolution",
            }),
            "SLA target extended."
        );
    };

    // ── field edits ──────────────────────────────────────────────────────────

    const changePriority = (value) => run(
        () => HelpdeskTicketsEndpoints.update(documentId, { priority: value }),
        "Priority updated."
    );

    const changeDesk = (value) => run(
        () => HelpdeskTicketsEndpoints.update(documentId, { desk_id: Number(value) }),
        "Desk changed."
    );

    // Success confirmations auto-dismiss (spec 38.6); errors stay until the next
    // action replaces them.
    useEffect(() => {
        if (!notice) return undefined;
        const id = setTimeout(() => setNotice(null), 4000);
        return () => clearTimeout(id);
    }, [notice]);

    if (!documentId) return null;
    // TERMINAL_STATUSES from the ticket repository — a protocol invariant
    // (RULE-5/RULE-13: a terminal ticket takes a reopen, an internal note and
    // audit, nothing else), not tenant-configurable vocabulary. Stages are
    // configuration and are never listed here; these three canonical statuses
    // are the contract the service enforces with a 409.
    const terminal = Boolean(ticket && ["closed", "cancelled", "merged"].includes(ticket.status));

    return (
        <div className="card mb-3">
            <div className="card-header py-2">
                <strong className="small text-uppercase"><i className="fa-solid fa-bolt me-2"></i>Actions</strong>
            </div>
            <div className="card-body">
                {notice && (
                    <div className="alert alert-success py-2 small d-flex align-items-center">
                        <i className="fa-solid fa-check me-2"></i>{notice}
                    </div>
                )}
                {error && (
                    <div className="alert alert-danger py-2 small d-flex align-items-start">
                        <i className="fa-solid fa-triangle-exclamation me-2 mt-1"></i><span>{error}</span>
                    </div>
                )}

                <Group title="Move" icon="fa-arrow-right-arrow-left">
                    {transitions.loading && !transitions.rows.length && (
                        <span className="placeholder-glow d-block"><span className="placeholder col-8"></span></span>
                    )}
                    {transitions.stale && (
                        <div className="text-warning-emphasis small mb-2">
                            <i className="fa-solid fa-triangle-exclamation me-1"></i>
                            Showing the moves from the last successful load.
                        </div>
                    )}
                    {!transitions.loading && !transitions.rows.length && !transitions.error && (
                        <div className="text-muted small">
                            No moves are available to you from this stage
                            {ticket && ticket.stage_key ? ` (${ticket.stage_key})` : ""}.
                        </div>
                    )}
                    {transitions.error && !transitions.stale && (
                        <div className="text-danger small">{transitions.error}</div>
                    )}
                    <div className="d-flex flex-wrap gap-2">
                        {/* One button per LEGAL move. The list is workflow
                            configuration, so nothing here is hardcoded — a
                            tenant adding a stage gets a button for free. */}
                        {transitions.rows.map((row) => (
                            <button
                                key={row.to_key}
                                type="button"
                                className={`btn btn-sm ${move && move.to_key === row.to_key ? "btn-primary" : "btn-outline-primary"}`}
                                onClick={() => chooseMove(row)}
                                disabled={busy}
                            >
                                {row.icon && <i className={`fa-solid ${row.icon} me-1`}></i>}
                                {row.label || row.to_key}
                            </button>
                        ))}
                    </div>

                    {panel === "transition" && move && ticket && (() => {
                        const { required, optional } = requirementsFor(move, ticket, desk);
                        const fields = [...required, ...optional.filter((k) => !required.includes(k))];
                        return (
                            <form className="mt-3 p-2 border rounded bg-light" onSubmit={submitTransition}>
                                <div className="small mb-2">
                                    Moving to <strong>{move.label || move.to_key}</strong>
                                    {move.maps_to_status && <span className="text-muted"> · status becomes {move.maps_to_status}</span>}
                                </div>
                                {fields.map((name) => (
                                    <FieldInput
                                        key={name}
                                        name={name}
                                        value={form[name]}
                                        required={required.includes(name)}
                                        onChange={setField}
                                    />
                                ))}
                                <div className="d-flex gap-2">
                                    <button className="btn btn-sm btn-primary" type="submit" disabled={busy}>
                                        {busy ? "Working…" : "Confirm move"}
                                    </button>
                                    <button className="btn btn-sm btn-outline-secondary" type="button" onClick={() => { setPanel(null); setMove(null); }}>
                                        Cancel
                                    </button>
                                </div>
                            </form>
                        );
                    })()}
                </Group>

                <Group title="Assignment" icon="fa-user-check">
                    <div className="d-flex flex-wrap gap-2">
                        <button className="btn btn-sm btn-outline-secondary" type="button" disabled={busy || terminal}
                            onClick={() => run(() => HelpdeskTicketsEndpoints.runClaim(documentId, {}), "Claimed.")}>
                            <i className="fa-solid fa-hand me-1"></i>Claim
                        </button>
                        {canManage && (
                            <>
                                <button className="btn btn-sm btn-outline-secondary" type="button" disabled={busy || terminal}
                                    onClick={() => openPanel("assign")}>
                                    <i className="fa-solid fa-user-plus me-1"></i>Assign…
                                </button>
                                <button className="btn btn-sm btn-outline-secondary" type="button" disabled={busy || terminal}
                                    onClick={() => run(() => HelpdeskTicketsEndpoints.runUnassign(documentId, {}), "Unassigned.")}>
                                    <i className="fa-solid fa-user-slash me-1"></i>Unassign
                                </button>
                                <button className="btn btn-sm btn-outline-secondary" type="button" disabled={busy || terminal}
                                    onClick={() => run(() => HelpdeskTicketsEndpoints.runRoute(documentId, {}), "Routing rules re-run.")}>
                                    <i className="fa-solid fa-diagram-project me-1"></i>Re-route
                                </button>
                            </>
                        )}
                    </div>

                    {panel === "assign" && (
                        <form className="mt-3 p-2 border rounded bg-light" onSubmit={submitAssign}>
                            {availability.loading && <div className="small text-muted mb-2">Loading the desk roster…</div>}
                            {availability.error && (
                                <div className="small text-muted mb-2">
                                    <i className="fa-solid fa-circle-info me-1"></i>
                                    Roster unavailable ({availability.error}) — assign by user id.
                                </div>
                            )}
                            <label className="form-label small mb-1" htmlFor="hd-assignee">Assign to</label>
                            {availability.agents.length > 0 ? (
                                <select
                                    id="hd-assignee"
                                    className="form-select form-select-sm mb-2"
                                    value={form.assignee_id || ""}
                                    onChange={(e) => setField("assignee_id", e.target.value)}
                                >
                                    <option value="">Choose an agent…</option>
                                    {availability.agents.map((a) => (
                                        <option key={a.userId} value={a.userId}>
                                            {a.label || `#${a.userId}`}
                                            {` · ${a.openTickets} open${a.cap ? ` / ${a.cap}` : ""}`}
                                            {a.eligible === false ? " · unavailable" : ""}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <input
                                    id="hd-assignee"
                                    className="form-control form-control-sm mb-2"
                                    placeholder="User id"
                                    inputMode="numeric"
                                    value={form.assignee_id || ""}
                                    onChange={(e) => setField("assignee_id", e.target.value)}
                                />
                            )}
                            <FieldInput name="reason" value={form.reason} required={false} onChange={setField} />
                            <div className="d-flex gap-2">
                                <button className="btn btn-sm btn-primary" type="submit" disabled={busy}>Assign</button>
                                <button className="btn btn-sm btn-outline-secondary" type="button" onClick={() => setPanel(null)}>Cancel</button>
                            </div>
                        </form>
                    )}
                </Group>

                <Group title="Ticket" icon="fa-sliders">
                    <div className="row g-2">
                        <div className="col-12">
                            <label className="form-label small mb-1" htmlFor="hd-priority">Priority</label>
                            {/* Priority values come from the enum route, never
                                from a list written here — a tenant that adds one
                                must not need a frontend change. */}
                            {priorities.values && priorities.values.length > 0 ? (
                                <select
                                    id="hd-priority"
                                    className="form-select form-select-sm"
                                    value={(ticket && ticket.priority) || ""}
                                    disabled={busy || !ticket || terminal}
                                    onChange={(e) => changePriority(e.target.value)}
                                >
                                    {priorities.values.map((v) => (
                                        <option key={v} value={v}>{humanise(v)}</option>
                                    ))}
                                </select>
                            ) : (
                                <div className="small text-muted">
                                    {priorities.loading
                                        ? "Loading priorities…"
                                        : `Priority is ${(ticket && ticket.priority) || "unknown"}. The priority list could not be loaded, so it cannot be changed here.`}
                                </div>
                            )}
                        </div>
                        <div className="col-12">
                            <label className="form-label small mb-1" htmlFor="hd-desk">Desk</label>
                            <select
                                id="hd-desk"
                                className="form-select form-select-sm"
                                value={(ticket && ticket.desk_id) || ""}
                                disabled={busy || !ticket || terminal || desks.length === 0}
                                onChange={(e) => changeDesk(e.target.value)}
                            >
                                {desks.length === 0 && <option value="">No desks loaded</option>}
                                {desks.map((d) => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </Group>

                <Group title="Links" icon="fa-link">
                    <div className="d-flex flex-wrap gap-2">
                        <button className="btn btn-sm btn-outline-secondary" type="button" disabled={busy || terminal}
                            onClick={() => openPanel("subject")}>
                            <i className="fa-solid fa-link me-1"></i>Link record…
                        </button>
                        {canManage && (
                            <>
                                <button className="btn btn-sm btn-outline-secondary" type="button" disabled={busy || terminal}
                                    onClick={() => openPanel("merge")}>
                                    <i className="fa-solid fa-code-merge me-1"></i>Merge…
                                </button>
                                <button className="btn btn-sm btn-outline-secondary" type="button" disabled={busy || terminal}
                                    onClick={() => {
                                        openPanel("split");
                                        if (onSplitModeChange) onSplitModeChange(true);
                                    }}>
                                    <i className="fa-solid fa-code-branch me-1"></i>Split…
                                </button>
                            </>
                        )}
                    </div>

                    {panel === "subject" && (
                        <form className="mt-3 p-2 border rounded bg-light" onSubmit={submitSubject}>
                            <FieldInput name="entity_uid" value={form.entity_uid} required onChange={setField} />
                            <FieldInput name="document_id" value={form.document_id} required onChange={setField} />
                            <div className="d-flex gap-2">
                                <button className="btn btn-sm btn-primary" type="submit" disabled={busy}>Link</button>
                                {ticket && ticket.subject_entity_uid && (
                                    <button className="btn btn-sm btn-outline-danger" type="button" disabled={busy} onClick={clearSubject}>
                                        Remove link
                                    </button>
                                )}
                                <button className="btn btn-sm btn-outline-secondary" type="button" onClick={() => setPanel(null)}>Cancel</button>
                            </div>
                        </form>
                    )}

                    {panel === "merge" && (
                        <form className="mt-3 p-2 border rounded bg-light" onSubmit={submitMerge}>
                            <div className="small text-muted mb-2">
                                This ticket's whole thread moves to the target and this ticket becomes merged.
                            </div>
                            <FieldInput name="target_no" value={form.target_no} required onChange={setField} />
                            <FieldInput name="reason" value={form.reason} required={false} onChange={setField} />
                            <div className="form-check mb-2">
                                <input
                                    className="form-check-input"
                                    type="checkbox"
                                    id="hd-merge-confirm"
                                    checked={Boolean(form.confirm)}
                                    onChange={(e) => setField("confirm", e.target.checked)}
                                />
                                <label className="form-check-label small" htmlFor="hd-merge-confirm">
                                    The two requesters are the same person (required when they cannot be matched automatically)
                                </label>
                            </div>
                            <div className="d-flex gap-2">
                                <button className="btn btn-sm btn-primary" type="submit" disabled={busy}>Merge</button>
                                <button className="btn btn-sm btn-outline-secondary" type="button" onClick={() => setPanel(null)}>Cancel</button>
                            </div>
                        </form>
                    )}

                    {panel === "split" && (
                        <form className="mt-3 p-2 border rounded bg-light" onSubmit={submitSplit}>
                            <div className="small mb-2">
                                Tick the messages in the conversation that should move.
                                {" "}
                                <strong>{selectedIds.length}</strong> selected.
                            </div>
                            <FieldInput name="subject" value={form.subject} required={false} onChange={setField} />
                            <FieldInput name="body" value={form.body} required={false} onChange={setField} />
                            <div className="d-flex gap-2">
                                <button className="btn btn-sm btn-primary" type="submit" disabled={busy || !selectedIds.length}>
                                    Split
                                </button>
                                <button className="btn btn-sm btn-outline-secondary" type="button"
                                    onClick={() => { setPanel(null); if (onSplitModeChange) onSplitModeChange(false); }}>
                                    Cancel
                                </button>
                            </div>
                        </form>
                    )}
                </Group>

                {canManage && (
                    <Group title="SLA" icon="fa-stopwatch">
                        <button className="btn btn-sm btn-outline-secondary" type="button" disabled={busy}
                            onClick={() => openPanel("sla")}>
                            <i className="fa-solid fa-clock-rotate-left me-1"></i>Extend target…
                        </button>
                        {panel === "sla" && (
                            <form className="mt-3 p-2 border rounded bg-light" onSubmit={submitExtendSla}>
                                <div className="mb-2">
                                    <label className="form-label small mb-1" htmlFor="hd-sla-clock">Clock</label>
                                    <select
                                        id="hd-sla-clock"
                                        className="form-select form-select-sm"
                                        value={form.clock || "resolution"}
                                        onChange={(e) => setField("clock", e.target.value)}
                                    >
                                        {/* Wire constants from sla.service, not tenant configuration. */}
                                        <option value="resolution">Resolution</option>
                                        <option value="first_response">First response</option>
                                    </select>
                                </div>
                                <div className="mb-2">
                                    <label className="form-label small mb-1" htmlFor="hd-sla-due">
                                        New due time<span className="text-danger ms-1" aria-hidden="true">*</span>
                                    </label>
                                    <input
                                        id="hd-sla-due"
                                        type="datetime-local"
                                        className="form-control form-control-sm"
                                        value={form.due_at || ""}
                                        onChange={(e) => setField("due_at", e.target.value)}
                                        required
                                    />
                                    <div className="form-text small">An extension must move the target later than it is now.</div>
                                </div>
                                <FieldInput name="reason" value={form.reason} required onChange={setField} />
                                <div className="d-flex gap-2">
                                    <button className="btn btn-sm btn-primary" type="submit" disabled={busy}>Extend</button>
                                    <button className="btn btn-sm btn-outline-secondary" type="button" onClick={() => setPanel(null)}>Cancel</button>
                                </div>
                            </form>
                        )}
                    </Group>
                )}

                {!canManage && (
                    <div className="text-muted small">
                        <i className="fa-solid fa-circle-info me-1"></i>
                        Some actions are restricted to helpdesk managers and admins.
                    </div>
                )}
            </div>
        </div>
    );
}
