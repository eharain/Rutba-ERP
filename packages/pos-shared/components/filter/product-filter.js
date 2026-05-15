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
    return null;
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
                    <SearchBar value={searchText} onChange={onSearchTextChange} />
                </div>
            )}
            {!hidden("brand") && (
                <div className="col">
                    <SearchableSelect
                        value={selectedBrand}
                        onChange={onBrandChange}
                        options={brandOptions}
                        placeholder="All Brands"
                    />
                </div>
            )}
            {!hidden("category") && (
                <div className="col">
                    <SearchableSelect
                        value={selectedCategory}
                        onChange={onCategoryChange}
                        options={categoryOptions}
                        placeholder="All Categories"
                    />
                </div>
            )}
            {!hidden("supplier") && (
                <div className="col">
                    <SearchableSelect
                        value={selectedSupplier}
                        onChange={onSupplierChange}
                        options={supplierOptions}
                        placeholder="All Suppliers"
                    />
                </div>
            )}
            {!hidden("term") && (
                <div className="col">
                    <SearchableSelect
                        value={selectedTerm}
                        onChange={onTermChange}
                        options={termOptions}
                        placeholder="All Terms"
                    />
                </div>
            )}
            {!hidden("purchase") && (
                <div className="col">
                    <SearchableSelect
                        value={selectedPurchase}
                        onChange={onPurchaseChange}
                        options={purchaseOptions}
                        placeholder="All Purchases"
                    />
                </div>
            )}
            {(extra || []).map((def) => (
                <div className="col" key={def.key}>
                    <FilterField def={def} />
                </div>
            ))}
        </div>
    );
}
