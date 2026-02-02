// components/filter/product-filter.js
import { useState, useEffect } from "react";
import { authApi } from "../../lib/api";
import SearchBar from "../SearchBar";
export function ProductFilter({ onFilterChange }) {
    const [brands, setBrands] = useState([]);
    const [categories, setCategories] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [termTypes, setTermTypes] = useState([]);

    const [selectedBrand, setSelectedBrand] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("");
    const [selectedSupplier, setSelectedSupplier] = useState("");
    const [selectedTerm, setSelectedTerm] = useState("");
    const [stockStatus, setStockStatus] = useState(false);
    const [outofStockOnly, setOutofStockOnly] = useState(false);
    const [searchText, setSearchText] = useState("");

    useEffect(() => {
        Promise.all([
            authApi.fetch("/brands"),
            authApi.fetch("/categories"),
            authApi.fetch("/suppliers"),
            authApi.fetch("/term-types", { populate: ["terms"] }),
        ]).then(([b, c, s, t]) => {
            setBrands(b?.data || []);
            setCategories(c?.data || []);
            setSuppliers(s?.data || []);
            setTermTypes(t?.data || []);
        });
    }, []);

    // Build query object
    useEffect(() => {


        const filters = { brands: [selectedBrand], categories: [selectedCategory], suppliers: [selectedSupplier], terms: [selectedTerm], stockStatus,  searchText }

        for (const [key, value] of Object.entries(filters)) {
            if (Array.isArray(value)) {
                filters[key] = value.filter(v => v); // Remove empty values
                if (filters[key].length === 0) delete filters[key]; // Remove key if
            }
        }

        console.log('selected filters', filters); 

        // Pass query object upwards
        onFilterChange(filters);
    }, [selectedBrand, selectedCategory, selectedSupplier, selectedTerm, stockStatus, searchText]);

    return (

        <div className="grid grid-cols-5 gap-3 mb-4 items-center">
            <SearchBar value={searchText} onChange={setSearchText} />

            {/* Brand */}

            <select
                className="border p-2 rounded"
                value={selectedBrand}
                onChange={(e) => setSelectedBrand(e.target.value)}
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
                onChange={(e) => setSelectedCategory(e.target.value)}
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
                onChange={(e) => setSelectedSupplier(e.target.value)}
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
                onChange={(e) => setSelectedTerm(e.target.value)}
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
