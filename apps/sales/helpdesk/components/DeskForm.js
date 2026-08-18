import { useEffect, useState } from "react";
import { HelpdeskDesksEndpoints } from "@rutba/api-provider/endpoints";
import { useEnumValues } from "@rutba/shared/lib/use-enum-values";

const humanize = (v) =>
    String(v).replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const KEY_RE = /^[a-z][a-z0-9_]*$/;

function serverError(err) {
    return err?.response?.data?.error || { message: err?.message || "Request failed" };
}

const csvToList = (text) =>
    String(text || "").split(",").map((s) => s.trim()).filter(Boolean);

const csvToIds = (text) =>
    csvToList(text).map(Number).filter((n) => Number.isFinite(n) && n > 0);

// Blank stays blank: the server distinguishes "not supplied" from 0/null on the
// id columns, and coercing an empty box to 0 would fail RULE-7 with a confusing
// "Workflow #0 does not exist" instead of "workflow_id is missing".
const toIdOrNull = (text) => {
    const s = String(text ?? "").trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : null;
};

const distinct = (rows, column) =>
    [...new Set((rows || []).map((r) => r[column]).filter(Boolean))];

/**
 * A select when /enums answers, a suggestion-backed text box when it does not.
 *
 * /enums/:name/:field is served by services/core but its route is registered under
 * `api::product.product`.`find`, and no policy for that pair is seeded for the
 * helpdesk_* roles — so the request 403s from this app today and the field falls
 * back rather than rendering a dead select. `suggest` carries values observed in
 * real desk rows, which keeps the control useful without a hardcoded copy of the
 * enum. Adding `helpdesk` to EnumsEndpoints/ProductsEndpoints and reseeding turns
 * every one of these into a plain select with no change here.
 *
 * `name={null}` skips the lookup entirely — for columns that live on a Core-owned
 * table (desks have no Strapi content type, so there is no enum route to ask).
 */
function EnumField({ name, field, value, onChange, suggest = [], blank = "—", ...rest }) {
    const { values, loading, error } = useEnumValues(name, field);
    const known = values && values.length ? values : null;
    const options = [...new Set([...(known || []), ...suggest, ...(value ? [value] : [])].filter(Boolean))];
    const listId = `hd-enum-${name || "local"}-${field}`;

    if (known) {
        return (
            <select
                className="form-select"
                value={value || ""}
                onChange={(e) => onChange(e.target.value)}
                {...rest}
            >
                <option value="">{blank}</option>
                {options.map((v) => (
                    <option key={v} value={v}>{humanize(v)}</option>
                ))}
            </select>
        );
    }

    return (
        <>
            <input
                className="form-control"
                list={options.length ? listId : undefined}
                value={value || ""}
                onChange={(e) => onChange(e.target.value)}
                disabled={loading}
                {...rest}
            />
            {options.length > 0 && (
                <datalist id={listId}>
                    {options.map((v) => <option key={v} value={v} />)}
                </datalist>
            )}
            {error && (
                <div className="form-text">
                    The allowed values could not be read from the server; the suggestions come
                    from the desks that already exist. An unknown value is rejected on save.
                </div>
            )}
        </>
    );
}

/**
 * A configuration id the seed provides and no screen can create. The datalist
 * offers the ids already in use, labelled by the desks using them, so an admin
 * can copy a working configuration instead of guessing — which is the only way
 * to satisfy RULE-7 until workflow / SLA-policy / calendar handlers exist.
 */
function ConfigIdField({ id, column, desks, value, onChange, required }) {
    const inUse = new Map();
    for (const desk of desks || []) {
        const key = desk[column];
        if (!key) continue;
        if (!inUse.has(key)) inUse.set(key, []);
        inUse.get(key).push(desk.key);
    }

    return (
        <>
            <input
                id={id}
                type="number"
                min="1"
                className="form-control"
                list={inUse.size ? `${id}-options` : undefined}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                required={required}
            />
            {inUse.size > 0 && (
                <datalist id={`${id}-options`}>
                    {[...inUse.entries()].map(([v, keys]) => (
                        <option key={v} value={v} label={`used by ${keys.join(", ")}`} />
                    ))}
                </datalist>
            )}
        </>
    );
}

const EMPTY = {
    key: "",
    name: "",
    description: "",
    sequence: "0",
    visibility_mode: "",
    default_priority: "",
    requester_kinds: "",
    workflow_id: "",
    sla_policy_id: "",
    business_calendar_id: "",
    default_assignee_id: "",
    default_team_id: "",
    email_address: "",
    branch_ids: "",
    category_map: "",
    reopen_window_days: "",
    auto_close_after_days: "",
    allow_anonymous: false,
    require_resolution_note: false,
    grant_line_manager_access: false,
    csat_enabled: false,
};

/**
 * Create / edit one desk. `desks` is the full list, used only as a source of
 * real values for the suggestion controls above — never as a hardcoded enum.
 */
export default function DeskForm({ desk, desks, onSaved, onCancel }) {
    const [form, setForm] = useState(EMPTY);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const editing = Boolean(desk && desk.id);

    useEffect(() => {
        if (!desk) {
            setForm(EMPTY);
            return;
        }
        setForm({
            key: desk.key || "",
            name: desk.name || "",
            description: desk.description || "",
            sequence: desk.sequence === null || desk.sequence === undefined ? "0" : String(desk.sequence),
            visibility_mode: desk.visibility_mode || "",
            default_priority: desk.default_priority || "",
            requester_kinds: (desk.requester_kinds || []).join(", "),
            workflow_id: desk.workflow_id ? String(desk.workflow_id) : "",
            sla_policy_id: desk.sla_policy_id ? String(desk.sla_policy_id) : "",
            business_calendar_id: desk.business_calendar_id ? String(desk.business_calendar_id) : "",
            default_assignee_id: desk.default_assignee_id ? String(desk.default_assignee_id) : "",
            default_team_id: desk.default_team_id ? String(desk.default_team_id) : "",
            email_address: desk.email_address || "",
            branch_ids: (desk.branch_ids || []).join(", "),
            category_map: (desk.category_map || []).join(", "),
            reopen_window_days: desk.reopen_window_days === null || desk.reopen_window_days === undefined
                ? "" : String(desk.reopen_window_days),
            auto_close_after_days: desk.auto_close_after_days === null || desk.auto_close_after_days === undefined
                ? "" : String(desk.auto_close_after_days),
            allow_anonymous: Boolean(desk.allow_anonymous),
            require_resolution_note: Boolean(desk.require_resolution_note),
            grant_line_manager_access: Boolean(desk.grant_line_manager_access),
            csat_enabled: Boolean(desk.csat_enabled),
        });
    }, [desk]);

    const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }));
    const setEvent = (field) => (e) => set(field)(e.target.value);
    const setCheck = (field) => (e) => set(field)(e.target.checked);

    const keyValid = !form.key || KEY_RE.test(form.key);

    const buildPayload = () => {
        const payload = {
            name: form.name.trim(),
            description: form.description.trim() || null,
            visibility_mode: form.visibility_mode || undefined,
            default_priority: form.default_priority || undefined,
            workflow_id: toIdOrNull(form.workflow_id),
            sla_policy_id: toIdOrNull(form.sla_policy_id),
            business_calendar_id: toIdOrNull(form.business_calendar_id),
            default_assignee_id: toIdOrNull(form.default_assignee_id),
            default_team_id: toIdOrNull(form.default_team_id),
            email_address: form.email_address.trim() || null,
            branch_ids: csvToIds(form.branch_ids),
            category_map: csvToList(form.category_map),
            requester_kinds: csvToList(form.requester_kinds),
            allow_anonymous: form.allow_anonymous,
            require_resolution_note: form.require_resolution_note,
            grant_line_manager_access: form.grant_line_manager_access,
            csat_enabled: form.csat_enabled,
        };
        if (form.sequence !== "") payload.sequence = Number(form.sequence);
        if (form.reopen_window_days !== "") payload.reopen_window_days = Number(form.reopen_window_days);
        if (form.auto_close_after_days !== "") payload.auto_close_after_days = Number(form.auto_close_after_days);
        // The key is immutable once created (it reaches routing rules, category
        // maps and the ticket-number format), so an edit never sends it.
        if (!editing) payload.key = form.key.trim().toLowerCase();
        return payload;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setSaving(true);
        try {
            const payload = buildPayload();
            const res = editing
                ? await HelpdeskDesksEndpoints.update(desk.id, payload)
                : await HelpdeskDesksEndpoints.create(payload);
            if (onSaved) onSaved(res?.data || null);
        } catch (err) {
            setError(serverError(err));
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} noValidate>
            {error && (
                <div className="alert alert-danger">
                    <div className="fw-semibold">
                        <i className="fas fa-triangle-exclamation me-2"></i>
                        {error.message || "The desk could not be saved."}
                    </div>
                    {error.details && (
                        <pre className="mb-0 mt-2 small text-break" style={{ whiteSpace: "pre-wrap" }}>
                            {JSON.stringify(error.details, null, 2)}
                        </pre>
                    )}
                </div>
            )}

            <div className="row g-3">
                <div className="col-md-4">
                    <label className="form-label" htmlFor="desk-key">Key *</label>
                    <input
                        id="desk-key"
                        className={`form-control${keyValid ? "" : " is-invalid"}`}
                        value={form.key}
                        onChange={setEvent("key")}
                        disabled={editing}
                        required
                    />
                    <div className="form-text">
                        {editing
                            ? "Immutable — it reaches routing rules, category maps and the ticket-number format."
                            : "Lower snake case, starting with a letter. Cannot be changed later."}
                    </div>
                    {!keyValid && <div className="invalid-feedback d-block">Lower snake case only, e.g. customer_support.</div>}
                </div>

                <div className="col-md-5">
                    <label className="form-label" htmlFor="desk-name">Name *</label>
                    <input
                        id="desk-name"
                        className="form-control"
                        value={form.name}
                        onChange={setEvent("name")}
                        required
                    />
                </div>

                <div className="col-md-3">
                    <label className="form-label" htmlFor="desk-sequence">Sequence</label>
                    <input
                        id="desk-sequence"
                        type="number"
                        min="0"
                        className="form-control"
                        value={form.sequence}
                        onChange={setEvent("sequence")}
                    />
                    <div className="form-text">Lower sorts first, and decides the tenant default desk.</div>
                </div>

                <div className="col-12">
                    <label className="form-label" htmlFor="desk-description">Description</label>
                    <textarea
                        id="desk-description"
                        className="form-control"
                        rows={2}
                        value={form.description}
                        onChange={setEvent("description")}
                    />
                </div>

                <div className="col-md-4">
                    <label className="form-label" htmlFor="desk-visibility">Visibility mode</label>
                    <EnumField
                        id="desk-visibility"
                        name={null}
                        field="visibility_mode"
                        value={form.visibility_mode}
                        onChange={set("visibility_mode")}
                        suggest={distinct(desks, "visibility_mode")}
                        blank="Server default"
                    />
                </div>

                <div className="col-md-4">
                    <label className="form-label" htmlFor="desk-priority">Default priority</label>
                    <EnumField
                        id="desk-priority"
                        name="contact-ticket"
                        field="priority"
                        value={form.default_priority}
                        onChange={set("default_priority")}
                        suggest={distinct(desks, "default_priority")}
                        blank="Server default"
                    />
                    <div className="form-text">
                        The SLA policy must carry a target for this priority, or the save is rejected.
                    </div>
                </div>

                <div className="col-md-4">
                    <label className="form-label" htmlFor="desk-requester-kinds">Requester kinds</label>
                    <input
                        id="desk-requester-kinds"
                        className="form-control"
                        value={form.requester_kinds}
                        onChange={setEvent("requester_kinds")}
                        placeholder="customer, employee"
                    />
                    <div className="form-text">Comma separated. Empty means every kind may file here.</div>
                </div>
            </div>

            <hr className="my-4" />

            <h6 className="text-uppercase text-muted small mb-3">Required configuration</h6>
            <p className="text-muted small">
                A desk cannot be saved without a workflow, an SLA policy and a business calendar —
                a desk without them produces tickets with no promise. There is no screen that
                creates these yet, so pick the ids the seed already provides; the suggestions below
                are the ones other desks use.
            </p>

            <div className="row g-3">
                <div className="col-md-4">
                    <label className="form-label" htmlFor="desk-workflow">Workflow id *</label>
                    <ConfigIdField
                        id="desk-workflow"
                        column="workflow_id"
                        desks={desks}
                        value={form.workflow_id}
                        onChange={set("workflow_id")}
                        required
                    />
                </div>
                <div className="col-md-4">
                    <label className="form-label" htmlFor="desk-sla">SLA policy id *</label>
                    <ConfigIdField
                        id="desk-sla"
                        column="sla_policy_id"
                        desks={desks}
                        value={form.sla_policy_id}
                        onChange={set("sla_policy_id")}
                        required
                    />
                </div>
                <div className="col-md-4">
                    <label className="form-label" htmlFor="desk-calendar">Business calendar id *</label>
                    <ConfigIdField
                        id="desk-calendar"
                        column="business_calendar_id"
                        desks={desks}
                        value={form.business_calendar_id}
                        onChange={set("business_calendar_id")}
                        required
                    />
                </div>
            </div>

            <hr className="my-4" />

            <h6 className="text-uppercase text-muted small mb-3">Behaviour</h6>
            <div className="row g-3">
                <div className="col-md-3">
                    <label className="form-label" htmlFor="desk-reopen">Reopen window (days)</label>
                    <input
                        id="desk-reopen"
                        type="number"
                        min="0"
                        className="form-control"
                        value={form.reopen_window_days}
                        onChange={setEvent("reopen_window_days")}
                    />
                </div>
                <div className="col-md-3">
                    <label className="form-label" htmlFor="desk-autoclose">Auto-close after (days)</label>
                    <input
                        id="desk-autoclose"
                        type="number"
                        min="0"
                        className="form-control"
                        value={form.auto_close_after_days}
                        onChange={setEvent("auto_close_after_days")}
                    />
                </div>
                <div className="col-md-3">
                    <label className="form-label" htmlFor="desk-assignee">Default assignee (user id)</label>
                    <input
                        id="desk-assignee"
                        type="number"
                        min="1"
                        className="form-control"
                        value={form.default_assignee_id}
                        onChange={setEvent("default_assignee_id")}
                    />
                </div>
                <div className="col-md-3">
                    <label className="form-label" htmlFor="desk-team">Default team id</label>
                    <input
                        id="desk-team"
                        type="number"
                        min="1"
                        className="form-control"
                        value={form.default_team_id}
                        onChange={setEvent("default_team_id")}
                    />
                </div>

                <div className="col-md-4">
                    <label className="form-label" htmlFor="desk-email">Inbound alias</label>
                    <input
                        id="desk-email"
                        type="email"
                        className="form-control"
                        value={form.email_address}
                        onChange={setEvent("email_address")}
                        placeholder="support@example.com"
                    />
                    <div className="form-text">Mail to this address lands on this desk. Must be unique.</div>
                </div>
                <div className="col-md-4">
                    <label className="form-label" htmlFor="desk-branches">Branch ids</label>
                    <input
                        id="desk-branches"
                        className="form-control"
                        value={form.branch_ids}
                        onChange={setEvent("branch_ids")}
                        placeholder="1, 2"
                    />
                    <div className="form-text">Comma separated. Empty means every branch.</div>
                </div>
                <div className="col-md-4">
                    <label className="form-label" htmlFor="desk-categories">Legacy categories</label>
                    <input
                        id="desk-categories"
                        className="form-control"
                        value={form.category_map}
                        onChange={setEvent("category_map")}
                        placeholder="IT, Facilities"
                    />
                    <div className="form-text">A category maps to exactly one desk.</div>
                </div>

                <div className="col-md-6">
                    <div className="form-check">
                        <input
                            id="desk-anonymous"
                            className="form-check-input"
                            type="checkbox"
                            checked={form.allow_anonymous}
                            onChange={setCheck("allow_anonymous")}
                        />
                        <label className="form-check-label" htmlFor="desk-anonymous">
                            Accept anonymous intake
                            <span className="d-block form-text">Public submissions with an email or phone but no account.</span>
                        </label>
                    </div>
                    <div className="form-check">
                        <input
                            id="desk-line-manager"
                            className="form-check-input"
                            type="checkbox"
                            checked={form.grant_line_manager_access}
                            onChange={setCheck("grant_line_manager_access")}
                        />
                        <label className="form-check-label" htmlFor="desk-line-manager">
                            Grant line managers access to their reports&apos; tickets
                        </label>
                    </div>
                </div>
                <div className="col-md-6">
                    <div className="form-check">
                        <input
                            id="desk-resolution-note"
                            className="form-check-input"
                            type="checkbox"
                            checked={form.require_resolution_note}
                            onChange={setCheck("require_resolution_note")}
                        />
                        <label className="form-check-label" htmlFor="desk-resolution-note">
                            Require a resolution note
                        </label>
                    </div>
                    <div className="form-check">
                        <input
                            id="desk-csat"
                            className="form-check-input"
                            type="checkbox"
                            checked={form.csat_enabled}
                            onChange={setCheck("csat_enabled")}
                        />
                        <label className="form-check-label" htmlFor="desk-csat">
                            Ask for CSAT after resolution
                        </label>
                    </div>
                </div>
            </div>

            <div className="d-flex justify-content-end gap-2 mt-4">
                {onCancel && (
                    <button type="button" className="btn btn-outline-secondary" onClick={onCancel} disabled={saving}>
                        Cancel
                    </button>
                )}
                <button className="btn btn-primary" disabled={saving || !form.name.trim() || (!editing && !form.key.trim()) || !keyValid}>
                    {saving && <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>}
                    {editing ? "Save desk" : "Create desk"}
                </button>
            </div>
        </form>
    );
}
