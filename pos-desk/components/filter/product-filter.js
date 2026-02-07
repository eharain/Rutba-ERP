// components/filter/product-filter.js
import SearchBar from "../SearchBar";
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

    return (

        <div className="grid grid-cols-5 gap-3 mb-4 items-center">
            <SearchBar value={searchText} onChange={onSearchTextChange} />

            {/* Brand */}

            <select
                className="border p-2 rounded"
                value={selectedBrand}
                onChange={(e) => onBrandChange(e.target.value)}
            >
                <option value="">All Brands</option>
                {brands.map((b) => (
                    <option key={b.documentId} value={b.documentId}>
                        {b.name}
                    </option>
                ))}
            </select>

            {/* Category */}
            <select
                className="border p-2 rounded"
                value={selectedCategory}
                onChange={(e) => onCategoryChange(e.target.value)}
            >
                <option value="">All Categories</option>
                {categories.map((c) => (
                    <option key={c.documentId} value={c.documentId}>
                        {c.name}
                    </option>
                ))}
            </select>

            {/* Supplier */}
            <select
                className="border p-2 rounded"
                value={selectedSupplier}
                onChange={(e) => onSupplierChange(e.target.value)}
            >
                <option value="">All Suppliers</option>
                {suppliers.map((s) => (
                    <option key={s.documentId} value={s.documentId}>
                        {s.name}
                    </option>
                ))}
            </select>

            {/* Term / Term-Type */}
            <select
                className="border p-2 rounded"
                value={selectedTerm}
                onChange={(e) => onTermChange(e.target.value)}
            >
                <option value="">All Terms</option>
                {termTypes.map((tt) =>
                    tt.terms?.map((t) => (
                        <option key={t.documentId} value={t.documentId}>
                            {tt.name} - {t.name}
                        </option>
                    ))
                )}
            </select>

            {/* <select
                className="border p-2 rounded"
                value={stockStatus}
                onChange={(e) => setStockStatus(e.target.value)}
            >

                <option value="">Any</option>
                <option value="inStock">In Stock</option>
                <option value="outofStock">Out Of Stock</option>
               
            </select> */}

        </div>
    );
}
