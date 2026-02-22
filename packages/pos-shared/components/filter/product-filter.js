// components/filter/product-filter.js
import SearchBar from "../SearchBar";
import SearchableSelect from "../SearchableSelect";

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
    onSearchTextChange
}) {
    const brandOptions = brands.map((b) => ({ value: b.documentId, label: b.name }));
    const categoryOptions = categories.map((c) => ({ value: c.documentId, label: c.name }));
    const supplierOptions = suppliers.map((s) => ({ value: s.documentId, label: s.name }));
    const termOptions = termTypes.flatMap((tt) =>
        (tt.terms || []).map((t) => ({ value: t.documentId, label: `${tt.name} - ${t.name}` }))
    );
    const purchaseOptions = (purchases || []).map((p) => ({ value: p.documentId, label: p.orderId }));

    return (

        <div className="row">
            <div className="col-12">
                <SearchBar value={searchText} onChange={onSearchTextChange} />
            </div>
            <div className="col">
                {/* Brand */}
                <SearchableSelect
                    value={selectedBrand}
                    onChange={onBrandChange}
                    options={brandOptions}
                    placeholder="All Brands"
                />
            </div>
            <div className="col">
                {/* Category */}
                <SearchableSelect
                    value={selectedCategory}
                    onChange={onCategoryChange}
                    options={categoryOptions}
                    placeholder="All Categories"
                />
            </div>
            <div className="col">
                {/* Supplier */}
                <SearchableSelect
                    value={selectedSupplier}
                    onChange={onSupplierChange}
                    options={supplierOptions}
                    placeholder="All Suppliers"
                />
            </div>
            <div className="col">
                {/* Term / Term-Type */}
                <SearchableSelect
                    value={selectedTerm}
                    onChange={onTermChange}
                    options={termOptions}
                    placeholder="All Terms"
                />
            </div>
            <div className="col">
                {/* Purchase */}
                <SearchableSelect
                    value={selectedPurchase}
                    onChange={onPurchaseChange}
                    options={purchaseOptions}
                    placeholder="All Purchases"
                />
            </div>
        </div>

    );
}
