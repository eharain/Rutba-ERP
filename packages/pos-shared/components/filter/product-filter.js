// components/filter/product-filter.js
import SearchBar from "../SearchBar";
import SearchableSelect from "../SearchableSelect";

/**
 * Render a single extra-filter cell. Drives the `extra` prop on
 * <ProductFilter/> below — every product-list surface that needs a new
 * filter chip (stock status, active/inactive, has-variants, branch, etc.)
 * should add a config here rather than fork the component.
 *
 * Definition shape:
 *   { key, label?, type?, value, onChange,
 *     options?,        // for select / searchable-select / multi-select
 *     placeholder?,
 *     trueLabel? }     // for toggle: label shown when checked
 *
 * type:
 *   'searchable-select' (default if options provided) — SearchableSelect dropdown
 *   'select'                                          — native <select>
 *   'text'                                            — plain text input
 *   'toggle'                                          — single checkbox
 *   'number-range'                                    — min/max number inputs
 *   'date-range'                                      — from/to date inputs
 *
 * For the range types, `value` is an object and `onChange` receives the full
 * next object:
 *   number-range → value { min, max }
 *   date-range   → value { from, to }
 */
function FilterField({ def }) {
    if (!def) return null;
    const type = def.type || (def.options ? "searchable-select" : "text");
    if (type === "searchable-select") {
        return (
            <SearchableSelect
                value={def.value}
                onChange={def.onChange}
                options={def.options || []}
                placeholder={def.placeholder || `All ${def.label || ""}`.trim()}
            />
        );
    }
    if (type === "select") {
        return (
            <select
                className="form-select form-select-sm"
                value={def.value ?? ""}
                onChange={(e) => def.onChange(e.target.value)}
            >
                {def.placeholder !== false && (
                    <option value="">{def.placeholder || `All ${def.label || ""}`.trim()}</option>
                )}
                {(def.options || []).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                ))}
            </select>
        );
    }
    if (type === "text") {
        return (
            <input
                type="text"
                className="form-control form-control-sm"
                value={def.value ?? ""}
                placeholder={def.placeholder || def.label}
                onChange={(e) => def.onChange(e.target.value)}
            />
        );
    }
    if (type === "toggle") {
        return (
            <div className="form-check form-check-inline align-self-center">
                <input
                    type="checkbox"
                    className="form-check-input"
                    id={`pf-${def.key}`}
                    checked={!!def.value}
                    onChange={(e) => def.onChange(e.target.checked)}
                />
                <label className="form-check-label small" htmlFor={`pf-${def.key}`}>
                    {def.trueLabel || def.label}
                </label>
            </div>
        );
    }
    if (type === "number-range") {
        const v = def.value || {};
        return (
            <div className="d-flex gap-1" title={def.label}>
                <input
                    type="number"
                    className="form-control form-control-sm"
                    placeholder={def.placeholderMin || `Min ${def.label || ""}`.trim()}
                    value={v.min ?? ""}
                    onChange={(e) => def.onChange({ ...v, min: e.target.value })}
                />
                <input
                    type="number"
                    className="form-control form-control-sm"
                    placeholder={def.placeholderMax || `Max ${def.label || ""}`.trim()}
                    value={v.max ?? ""}
                    onChange={(e) => def.onChange({ ...v, max: e.target.value })}
                />
            </div>
        );
    }
    if (type === "date-range") {
        const v = def.value || {};
        return (
            <div className="d-flex gap-1 align-items-center" title={def.label}>
                {def.label && <span className="small text-muted text-nowrap">{def.label}</span>}
                <input
                    type="date"
                    className="form-control form-control-sm"
                    value={v.from ?? ""}
                    onChange={(e) => def.onChange({ ...v, from: e.target.value })}
                />
                <input
                    type="date"
                    className="form-control form-control-sm"
                    value={v.to ?? ""}
                    onChange={(e) => def.onChange({ ...v, to: e.target.value })}
                />
            </div>
        );
    }
    return null;
}

// Built-in select cells share this responsive width; combined with the
// per-type widths below, the cells flow onto multiple rows instead of being
// crammed into a single line.
const BUILTIN_COL = "col-6 col-md-4 col-lg-3";

// Width for an extra cell. Range cells are wider (they hold two inputs);
// toggles are narrow. A def may override with an explicit `colClass`.
function colClassFor(def) {
    if (def.colClass) return def.colClass;
    const type = def.type || (def.options ? "searchable-select" : "text");
    if (type === "toggle") return "col-6 col-md-3 col-lg-2 d-flex align-items-center";
    if (type === "number-range" || type === "date-range") return "col-12 col-sm-6 col-md-4";
    return "col-6 col-md-4 col-lg-3";
}

export function ProductFilter({
    brands,
    categories,
    suppliers,
    termTypes,
    purchases,
    selectedBrand,
    selectedCategory,
    selectedSupplier,
    selectedTerm,
    selectedPurchase,
    searchText,
    onBrandChange,
    onCategoryChange,
    onSupplierChange,
    onTermChange,
    onPurchaseChange,
    onSearchTextChange,
    // Hide individual built-in filter cells when the calling page doesn't
    // surface them (e.g. a per-product stock page only wants stock-status).
    // Pass any of: 'brand' | 'category' | 'supplier' | 'term' | 'purchase' | 'search'
    hide,
    // Additional filter cells. Each becomes a column at the same level as
    // the built-ins. See FilterField above for definition shape.
    extra = [],
}) {
    const hidden = (k) => hide && hide.has(k);
    const brandOptions = (brands || []).map((b) => ({ value: b.documentId, label: b.name }));
    const categoryOptions = (categories || []).map((c) => ({ value: c.documentId, label: c.name }));
    const supplierOptions = (suppliers || []).map((s) => ({ value: s.documentId, label: s.name }));
    const termOptions = (termTypes || []).flatMap((tt) =>
        (tt.terms || []).map((t) => ({ value: t.documentId, label: `${tt.name} - ${t.name}` }))
    );
    const purchaseOptions = (purchases || []).map((p) => ({ value: p.documentId, label: p.orderId }));

    return (
        <div className="row g-2">
            {!hidden("search") && (
                <div className="col-12">
                    <SearchBar
                        value={searchText}
                        onChange={onSearchTextChange}
                        placeholder="Search by name, SKU, barcode (product or stock item), supplier code, supplier name, or PO number…"
                    />
                </div>
            )}
            {!hidden("brand") && (
                <div className={BUILTIN_COL}>
                    <SearchableSelect
                        value={selectedBrand}
                        onChange={onBrandChange}
                        options={brandOptions}
                        placeholder="All Brands"
                    />
                </div>
            )}
            {!hidden("category") && (
                <div className={BUILTIN_COL}>
                    <SearchableSelect
                        value={selectedCategory}
                        onChange={onCategoryChange}
                        options={categoryOptions}
                        placeholder="All Categories"
                    />
                </div>
            )}
            {!hidden("supplier") && (
                <div className={BUILTIN_COL}>
                    <SearchableSelect
                        value={selectedSupplier}
                        onChange={onSupplierChange}
                        options={supplierOptions}
                        placeholder="All Suppliers"
                    />
                </div>
            )}
            {!hidden("term") && (
                <div className={BUILTIN_COL}>
                    <SearchableSelect
                        value={selectedTerm}
                        onChange={onTermChange}
                        options={termOptions}
                        placeholder="All Terms"
                    />
                </div>
            )}
            {!hidden("purchase") && (
                <div className={BUILTIN_COL}>
                    <SearchableSelect
                        value={selectedPurchase}
                        onChange={onPurchaseChange}
                        options={purchaseOptions}
                        placeholder="All Purchases"
                    />
                </div>
            )}
            {(extra || []).map((def) => (
                <div className={colClassFor(def)} key={def.key}>
                    <FilterField def={def} />
                </div>
            ))}
        </div>
    );
}
