import { useEnumValues } from "../lib/use-enum-values";

const defaultHumanize = (s) =>
    String(s)
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

// Bootstrap-styled <select> backed by Strapi's /enums/:name/:field route.
// `name` is the content-type short name (e.g. "product-group", "cms-page").
// `labels` overrides the auto-humanised display per value. `labelFor` is a
// function fallback. `includeBlank` adds an empty option with the given text.
export default function EnumSelect({
    name,
    field,
    value,
    onChange,
    labels,
    labelFor,
    includeBlank,
    placeholder,
    className = "form-select",
    disabled,
    ...rest
}) {
    const { values, loading, error } = useEnumValues(name, field);

    const labelOf = (v) => labels?.[v] ?? (labelFor ? labelFor(v) : defaultHumanize(v));

    return (
        <select
            className={className}
            value={value ?? ""}
            onChange={onChange}
            disabled={disabled || loading}
            {...rest}
        >
            {includeBlank !== undefined && (
                <option value="">{includeBlank || "—"}</option>
            )}
            {loading && !values?.length && <option>Loading…</option>}
            {error && !values?.length && <option>Failed to load</option>}
            {(values || []).map((v) => (
                <option key={v} value={v}>
                    {labelOf(v)}
                </option>
            ))}
            {/* Preserve a legacy value that's no longer in the enum so it stays
                visible until the user picks a new one. */}
            {value && (values || []).length > 0 && !(values || []).includes(value) && (
                <option value={value}>{labelOf(value)} (legacy)</option>
            )}
            {placeholder && !value && (values || []).length === 0 && !loading && (
                <option disabled value="">{placeholder}</option>
            )}
        </select>
    );
}
