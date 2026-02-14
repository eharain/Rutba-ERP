// components/filter/product-filter.js
import SearchBar from "../SearchBar";
import SearchableSelect from "../SearchableSelect";

export function ProductFilter({
    brands,
    categories,
    suppliers,
    termTypes,
    selectedBrand,
    selectedCategory,
    selectedSupplier,
    selectedTerm,
    searchText,
    onBrandChange,
    onCategoryChange,
    onSupplierChange,
    onTermChange,
    onSearchTextChange
}) {
    const brandOptions = brands.map((b) => ({ value: b.documentId, label: b.name }));
    const categoryOptions = categories.map((c) => ({ value: c.documentId, label: c.name }));
    const supplierOptions = suppliers.map((s) => ({ value: s.documentId, label: s.name }));
    const termOptions = termTypes.flatMap((tt) =>
        (tt.terms || []).map((t) => ({ value: t.documentId, label: `${tt.name} - ${t.name}` }))
    );

    return (

        <div className="row">
            <div className="col-12">
                <SearchBar value={searchText} onChange={onSearchTextChange} />
            </div>
            <div className="col-3">
                {/* Brand */}
                <SearchableSelect
                    value={selectedBrand}
                    onChange={onBrandChange}
                    options={brandOptions}
                    placeholder="All Brands"
                />
            </div>
            <div className="col-3">
                {/* Category */}
                <SearchableSelect
                    value={selectedCategory}
                    onChange={onCategoryChange}
                    options={categoryOptions}
                    placeholder="All Categories"
                />
            </div>
            <div className="col-3">
                {/* Supplier */}
                <SearchableSelect
                    value={selectedSupplier}
                    onChange={onSupplierChange}
                    options={supplierOptions}
                    placeholder="All Suppliers"
                />
            </div>
            <div className="col-3">
                {/* Term / Term-Type */}
                <SearchableSelect
                    value={selectedTerm}
                    onChange={onTermChange}
                    options={termOptions}
                    placeholder="All Terms"
                />
            </div>
        </div>

    );
}
