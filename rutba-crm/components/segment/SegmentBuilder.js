import { useState, useEffect, useMemo } from "react";
import { CrmSegmentsEndpoints } from "@rutba/api-provider/endpoints";
import EnumSelect from "@rutba/pos-shared/components/EnumSelect";

/**
 * The rule builder for a saved segment (CRM plan §5.3).
 *
 * Everything it renders — the entity list, the field list, which operators
 * each field allows, and where an enum field's values come from — is read
 * from GET /crm-segments/fields. The component holds no copy of any of it, so
 * a schema or catalog change reaches the UI without a frontend release.
 */

const emptyRule = () => ({ field: "", op: "", value: "", value2: "" });

function RuleRow({ rule, fields, onChange, onRemove }) {
    const field = fields.find((f) => f.key === rule.field);
    const operators = field?.operators || [];
    const operator = operators.find((o) => o.key === rule.op);
    const arity = operator?.arity ?? 1;

    const setField = (key) => {
        const next = fields.find((f) => f.key === key);
        // Operators are per-type, so a field change usually invalidates the
        // operator. Keep it when it's still offered, else take the first.
        const keep = next?.operators.some((o) => o.key === rule.op);
        onChange({ ...rule, field: key, op: keep ? rule.op : next?.operators[0]?.key || "", value: "", value2: "" });
    };

    return (
        <div className="row g-2 align-items-end mb-2">
            <div className="col-md-4">
                <select className="form-select" value={rule.field} onChange={(e) => setField(e.target.value)}>
                    <option value="">Choose a field…</option>
                    {fields.map((f) => (
                        <option key={f.key} value={f.key}>{f.label}</option>
                    ))}
                </select>
            </div>

            <div className="col-md-3">
                <select
                    className="form-select"
                    value={rule.op}
                    disabled={!field}
                    onChange={(e) => onChange({ ...rule, op: e.target.value, value: "", value2: "" })}
                >
                    {operators.map((o) => (
                        <option key={o.key} value={o.key}>{o.label}</option>
                    ))}
                </select>
            </div>

            <div className="col-md-4">
                {arity === 0 && <input className="form-control" disabled value="—" />}

                {arity === 1 && field?.enum_source && (
                    <EnumSelect
                        name={field.enum_source.name}
                        field={field.enum_source.field}
                        value={rule.value}
                        onChange={(e) => onChange({ ...rule, value: e.target.value })}
                        includeBlank="— pick a value —"
                    />
                )}

                {arity === 1 && !field?.enum_source && (
                    <input
                        className="form-control"
                        type={field?.type === "number" ? "number" : field?.type === "date" ? "date" : "text"}
                        value={rule.value}
                        onChange={(e) => onChange({ ...rule, value: e.target.value })}
                        placeholder={field?.type === "date" && String(rule.op).includes("days") ? "number of days" : ""}
                    />
                )}

                {arity === "many" && (
                    <input
                        className="form-control"
                        value={rule.value}
                        onChange={(e) => onChange({ ...rule, value: e.target.value })}
                        placeholder="comma-separated values"
                    />
                )}

                {arity === 2 && (
                    <div className="d-flex gap-2">
                        <input
                            className="form-control"
                            type={field?.type === "date" ? "date" : "number"}
                            value={rule.value}
                            onChange={(e) => onChange({ ...rule, value: e.target.value })}
                        />
                        <input
                            className="form-control"
                            type={field?.type === "date" ? "date" : "number"}
                            value={rule.value2}
                            onChange={(e) => onChange({ ...rule, value2: e.target.value })}
                        />
                    </div>
                )}
            </div>

            <div className="col-md-1 text-end">
                <button type="button" className="btn btn-outline-danger btn-sm" onClick={onRemove}>
                    <i className="fas fa-times"></i>
                </button>
            </div>
        </div>
    );
}

export default function SegmentBuilder({ entity, definition, columns, onEntityChange, onDefinitionChange, onColumnsChange }) {
    const [catalog, setCatalog] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        CrmSegmentsEndpoints.listFields()
            .then((res) => { if (alive) setCatalog(res?.data || null); })
            .catch((err) => { console.error("Failed to load the segment field catalog", err); if (alive) setError("Could not load the field catalog."); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, []);

    const entities = catalog?.entities || [];
    const fields = useMemo(
        () => entities.find((e) => e.entity === entity)?.fields || [],
        [entities, entity],
    );

    // Only own-table scalars can be displayed as columns — a filter can walk
    // a relation, a grid cell can't.
    const columnFields = useMemo(() => fields.filter((f) => f.column), [fields]);
    // Empty selection means "all of them", which is what the engine does too.
    const selectedColumns = Array.isArray(columns) && columns.length
        ? columns
        : columnFields.map((f) => f.key);

    const match = definition?.match || "all";
    const rules = definition?.rules || [];
    const groups = definition?.groups || [];

    const patch = (changes) => onDefinitionChange({ match, rules, groups, ...changes });

    if (loading) return <div className="text-muted">Loading the field catalog…</div>;
    if (error) return <div className="alert alert-danger">{error}</div>;

    return (
        <div>
            <div className="row g-3 mb-3">
                <div className="col-md-4">
                    <label className="form-label">Select from</label>
                    <select
                        className="form-select"
                        value={entity}
                        onChange={(e) => {
                            // Fields are per-entity — an inherited rule set would
                            // reference fields that no longer exist and 400 on save,
                            // and inherited columns would silently drop out.
                            onEntityChange(e.target.value);
                            onDefinitionChange({ match: "all", rules: [], groups: [] });
                            onColumnsChange?.([]);
                        }}
                    >
                        {entities.map((e) => (
                            <option key={e.entity} value={e.entity}>{e.label}</option>
                        ))}
                    </select>
                </div>
                <div className="col-md-4">
                    <label className="form-label">Match</label>
                    <select className="form-select" value={match} onChange={(e) => patch({ match: e.target.value })}>
                        <option value="all">All of the rules</option>
                        <option value="any">Any of the rules</option>
                    </select>
                </div>
            </div>

            <div className="border rounded p-3 mb-3">
                {rules.length === 0 && (
                    <p className="text-muted mb-2">No rules — this segment matches everyone in the selected set.</p>
                )}
                {rules.map((r, i) => (
                    <RuleRow
                        key={i}
                        rule={r}
                        fields={fields}
                        onChange={(next) => patch({ rules: rules.map((x, j) => (j === i ? next : x)) })}
                        onRemove={() => patch({ rules: rules.filter((_, j) => j !== i) })}
                    />
                ))}
                <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => patch({ rules: [...rules, emptyRule()] })}>
                    <i className="fas fa-plus me-1"></i>Add rule
                </button>
            </div>

            {groups.map((g, gi) => (
                <div key={gi} className="border rounded p-3 mb-3 bg-light">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                        <div className="d-flex align-items-center gap-2">
                            <span className="badge bg-secondary">{match === "any" ? "OR" : "AND"}</span>
                            <select
                                className="form-select form-select-sm w-auto"
                                value={g.match || "all"}
                                onChange={(e) => patch({ groups: groups.map((x, j) => (j === gi ? { ...x, match: e.target.value } : x)) })}
                            >
                                <option value="all">All of</option>
                                <option value="any">Any of</option>
                            </select>
                        </div>
                        <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => patch({ groups: groups.filter((_, j) => j !== gi) })}>
                            Remove group
                        </button>
                    </div>
                    {(g.rules || []).map((r, i) => (
                        <RuleRow
                            key={i}
                            rule={r}
                            fields={fields}
                            onChange={(next) => patch({
                                groups: groups.map((x, j) => (j === gi
                                    ? { ...x, rules: (x.rules || []).map((y, k) => (k === i ? next : y)) }
                                    : x)),
                            })}
                            onRemove={() => patch({
                                groups: groups.map((x, j) => (j === gi
                                    ? { ...x, rules: (x.rules || []).filter((_, k) => k !== i) }
                                    : x)),
                            })}
                        />
                    ))}
                    <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        onClick={() => patch({
                            groups: groups.map((x, j) => (j === gi ? { ...x, rules: [...(x.rules || []), emptyRule()] } : x)),
                        })}
                    >
                        <i className="fas fa-plus me-1"></i>Add rule
                    </button>
                </div>
            ))}

            {/* The engine allows one level of nesting — deeper groups are
                rejected at compile time, so don't offer them. */}
            {groups.length === 0 && (
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => patch({ groups: [{ match: "all", rules: [emptyRule()] }] })}>
                    <i className="fas fa-layer-group me-1"></i>Add a nested group
                </button>
            )}

            {onColumnsChange && columnFields.length > 0 && (
                <div className="mt-4">
                    <label className="form-label mb-1">Columns</label>
                    <div className="border rounded p-3">
                        <div className="d-flex flex-wrap gap-3">
                            {columnFields.map((f) => (
                                <div className="form-check" key={f.key}>
                                    <input
                                        className="form-check-input"
                                        type="checkbox"
                                        id={`col-${f.key}`}
                                        checked={selectedColumns.includes(f.key)}
                                        onChange={(e) => onColumnsChange(
                                            e.target.checked
                                                // Keep catalog order rather than click
                                                // order, so the grid doesn't reshuffle
                                                // as you tick boxes.
                                                ? columnFields.filter((c) => c.key === f.key || selectedColumns.includes(c.key)).map((c) => c.key)
                                                : selectedColumns.filter((k) => k !== f.key)
                                        )}
                                    />
                                    <label className="form-check-label" htmlFor={`col-${f.key}`}>{f.label}</label>
                                </div>
                            ))}
                        </div>
                        <small className="text-muted d-block mt-2">
                            {columns?.length
                                ? "Only these columns appear in the results and the CSV export."
                                : "None picked — the results show every available column."}
                            {" Filters can use any field; only these scalar columns are displayable."}
                        </small>
                    </div>
                </div>
            )}
        </div>
    );
}
