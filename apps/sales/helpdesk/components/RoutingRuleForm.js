import { useEffect, useState } from "react";
import { HelpdeskConfigEndpoints } from "@rutba/api-provider/endpoints";

function serverError(err) {
    return err?.response?.data?.error || { message: err?.message || "Request failed" };
}

const toIdOrNull = (text) => {
    const s = String(text ?? "").trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : null;
};

const CONDITIONS_EXAMPLE = `{
  "all": [
    { "field": "priority", "op": "eq", "value": "urgent" },
    { "field": "tags", "op": "contains", "value": "vip" }
  ]
}`;

const EMPTY = {
    key: "",
    name: "",
    desk_id: "",
    sequence: "100",
    strategy: "",
    target_desk_id: "",
    target_team_id: "",
    target_agent_id: "",
    conditions: "",
    is_active: true,
};

/**
 * Create / edit one routing rule.
 *
 * `conditions` is a JSON textarea by design for this pass — a visual builder is
 * out of scope, and the raw tree is what the server evaluates, so an admin
 * debugging a rule reads exactly what runs. The server validates the tree
 * strictly on save (an unknown operator or an unaddressable field path is
 * rejected in front of the author rather than silently matching nothing at 3am),
 * and that rejection is rendered verbatim below.
 *
 * `strategies` is the set already in use by existing rules — the strategy
 * vocabulary lives in services/core and no endpoint publishes it, so the box accepts
 * free text and the server names the allowed values when it refuses.
 */
export default function RoutingRuleForm({ rule, desks, strategies, onSaved, onCancel }) {
    const [form, setForm] = useState(EMPTY);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [jsonError, setJsonError] = useState(null);

    const editing = Boolean(rule && rule.id);

    useEffect(() => {
        if (!rule) {
            setForm(EMPTY);
            setJsonError(null);
            return;
        }
        setForm({
            key: rule.key || "",
            name: rule.name || "",
            desk_id: rule.desk_id ? String(rule.desk_id) : "",
            sequence: rule.sequence === null || rule.sequence === undefined ? "100" : String(rule.sequence),
            strategy: rule.strategy || "",
            target_desk_id: rule.target_desk_id ? String(rule.target_desk_id) : "",
            target_team_id: rule.target_team_id ? String(rule.target_team_id) : "",
            target_agent_id: rule.target_agent_id ? String(rule.target_agent_id) : "",
            conditions: rule.conditions ? JSON.stringify(rule.conditions, null, 2) : "",
            is_active: rule.is_active !== false,
        });
        setJsonError(null);
    }, [rule]);

    const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

    const parseConditions = () => {
        const raw = form.conditions.trim();
        if (!raw) return { ok: true, value: null };
        try {
            return { ok: true, value: JSON.parse(raw) };
        } catch (err) {
            return { ok: false, message: err.message };
        }
    };

    const handleConditionsBlur = () => {
        const parsed = parseConditions();
        setJsonError(parsed.ok ? null : parsed.message);
    };

    const formatConditions = () => {
        const parsed = parseConditions();
        if (!parsed.ok) {
            setJsonError(parsed.message);
            return;
        }
        setJsonError(null);
        setForm((f) => ({ ...f, conditions: parsed.value === null ? "" : JSON.stringify(parsed.value, null, 2) }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const parsed = parseConditions();
        if (!parsed.ok) {
            setJsonError(parsed.message);
            return;
        }
        setJsonError(null);
        setError(null);
        setSaving(true);
        try {
            const payload = {
                name: form.name.trim(),
                key: form.key.trim() || null,
                desk_id: toIdOrNull(form.desk_id),
                sequence: form.sequence === "" ? 100 : Number(form.sequence),
                strategy: form.strategy.trim() || null,
                target_desk_id: toIdOrNull(form.target_desk_id),
                target_team_id: toIdOrNull(form.target_team_id),
                target_agent_id: toIdOrNull(form.target_agent_id),
                conditions: parsed.value,
                is_active: form.is_active,
            };
            const res = editing
                ? await HelpdeskConfigEndpoints.updateRoutingRule(rule.id, payload)
                : await HelpdeskConfigEndpoints.createRoutingRule(payload);
            if (onSaved) onSaved(res?.data || null);
        } catch (err) {
            setError(serverError(err));
        } finally {
            setSaving(false);
        }
    };

    const strategyOptions = [...new Set([...(strategies || []), ...(form.strategy ? [form.strategy] : [])].filter(Boolean))];
    const conditionsEmpty = !form.conditions.trim();

    return (
        <form onSubmit={handleSubmit} noValidate>
            {error && (
                <div className="alert alert-danger">
                    <div className="fw-semibold">
                        <i className="fas fa-triangle-exclamation me-2"></i>
                        {error.message || "The rule could not be saved."}
                    </div>
                    {error.details && (
                        <pre className="mb-0 mt-2 small text-break" style={{ whiteSpace: "pre-wrap" }}>
                            {JSON.stringify(error.details, null, 2)}
                        </pre>
                    )}
                </div>
            )}

            <div className="row g-3">
                <div className="col-md-5">
                    <label className="form-label" htmlFor="rule-name">Name *</label>
                    <input
                        id="rule-name"
                        className="form-control"
                        value={form.name}
                        onChange={set("name")}
                        required
                    />
                </div>
                <div className="col-md-3">
                    <label className="form-label" htmlFor="rule-key">Key</label>
                    <input
                        id="rule-key"
                        className="form-control"
                        value={form.key}
                        onChange={set("key")}
                        placeholder="vip_to_senior"
                    />
                </div>
                <div className="col-md-2">
                    <label className="form-label" htmlFor="rule-sequence">Sequence</label>
                    <input
                        id="rule-sequence"
                        type="number"
                        min="0"
                        className="form-control"
                        value={form.sequence}
                        onChange={set("sequence")}
                    />
                    <div className="form-text">First match wins.</div>
                </div>
                <div className="col-md-2 d-flex align-items-center">
                    <div className="form-check mt-4">
                        <input
                            id="rule-active"
                            className="form-check-input"
                            type="checkbox"
                            checked={form.is_active}
                            onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                        />
                        <label className="form-check-label" htmlFor="rule-active">Active</label>
                    </div>
                </div>

                {!form.is_active && (
                    <div className="col-12">
                        <div className="alert alert-warning py-2 mb-0 small">
                            The rules endpoint only returns active rules, so saving this will remove it from
                            the list on this screen. Deactivating is effectively archiving.
                        </div>
                    </div>
                )}

                <div className="col-md-6">
                    <label className="form-label" htmlFor="rule-desk">Applies to desk</label>
                    <select
                        id="rule-desk"
                        className="form-select"
                        value={form.desk_id}
                        onChange={set("desk_id")}
                    >
                        <option value="">Tenant-wide (every desk)</option>
                        {(desks || []).map((d) => (
                            <option key={d.id} value={d.id}>{d.name} ({d.key})</option>
                        ))}
                    </select>
                    <div className="form-text">
                        A desk-scoped rule is evaluated alongside the tenant-wide ones. Only a tenant-wide
                        rule with a target desk can decide which desk a ticket belongs to.
                    </div>
                </div>

                <div className="col-md-6">
                    <label className="form-label" htmlFor="rule-strategy">Strategy</label>
                    <input
                        id="rule-strategy"
                        className="form-control"
                        list={strategyOptions.length ? "rule-strategy-options" : undefined}
                        value={form.strategy}
                        onChange={set("strategy")}
                        placeholder="Leave blank to inherit the desk / tenant default"
                    />
                    {strategyOptions.length > 0 && (
                        <datalist id="rule-strategy-options">
                            {strategyOptions.map((s) => <option key={s} value={s} />)}
                        </datalist>
                    )}
                    <div className="form-text">
                        Suggestions come from the rules that already exist. An unknown strategy is rejected
                        on save with the allowed list.
                    </div>
                </div>

                <div className="col-md-4">
                    <label className="form-label" htmlFor="rule-target-desk">Target desk</label>
                    <select
                        id="rule-target-desk"
                        className="form-select"
                        value={form.target_desk_id}
                        onChange={set("target_desk_id")}
                    >
                        <option value="">—</option>
                        {(desks || []).map((d) => (
                            <option key={d.id} value={d.id}>{d.name} ({d.key})</option>
                        ))}
                    </select>
                </div>
                <div className="col-md-4">
                    <label className="form-label" htmlFor="rule-target-team">Target team id</label>
                    <input
                        id="rule-target-team"
                        type="number"
                        min="1"
                        className="form-control"
                        value={form.target_team_id}
                        onChange={set("target_team_id")}
                    />
                </div>
                <div className="col-md-4">
                    <label className="form-label" htmlFor="rule-target-agent">Target agent (user id)</label>
                    <input
                        id="rule-target-agent"
                        type="number"
                        min="1"
                        className="form-control"
                        value={form.target_agent_id}
                        onChange={set("target_agent_id")}
                    />
                    <div className="form-text">Still subject to eligibility — a rule cannot assign someone on leave.</div>
                </div>

                <div className="col-12">
                    <div className="d-flex justify-content-between align-items-center">
                        <label className="form-label mb-0" htmlFor="rule-conditions">Conditions (JSON)</label>
                        <button type="button" className="btn btn-sm btn-link" onClick={formatConditions}>
                            Format
                        </button>
                    </div>
                    <textarea
                        id="rule-conditions"
                        className={`form-control font-monospace${jsonError ? " is-invalid" : ""}`}
                        rows={10}
                        spellCheck={false}
                        value={form.conditions}
                        onChange={set("conditions")}
                        onBlur={handleConditionsBlur}
                        placeholder={CONDITIONS_EXAMPLE}
                    />
                    {jsonError && <div className="invalid-feedback d-block">Not valid JSON — {jsonError}</div>}
                    {conditionsEmpty && !jsonError && (
                        <div className="form-text text-warning">
                            <i className="fas fa-circle-info me-1"></i>
                            Empty conditions match every ticket. That makes this the catch-all, and any rule
                            after it in sequence never runs.
                        </div>
                    )}
                    <div className="form-text">
                        A tree of <code>all</code> / <code>any</code> / <code>not</code> groups over
                        <code className="mx-1">{"{ field, op, value }"}</code> leaves. The addressable field
                        namespace and the operator set are documented in the routing spec (§14.7) and in
                        services/core <code>domain/helpdesk/conditions.js</code>; the server names them when it
                        rejects a tree, so a wrong path never becomes a rule that silently matches nothing.
                    </div>
                </div>
            </div>

            <div className="d-flex justify-content-end gap-2 mt-4">
                {onCancel && (
                    <button type="button" className="btn btn-outline-secondary" onClick={onCancel} disabled={saving}>
                        Cancel
                    </button>
                )}
                <button className="btn btn-primary" disabled={saving || !form.name.trim() || Boolean(jsonError)}>
                    {saving && <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>}
                    {editing ? "Save rule" : "Create rule"}
                </button>
            </div>
        </form>
    );
}
