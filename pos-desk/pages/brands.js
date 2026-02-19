import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Layout from "../components/Layout";
import ProtectedRoute from "../components/ProtectedRoute";
import { authApi } from "../lib/api";
import { useUtil } from "../context/UtilContext";
import FileView from "../components/FileView";

export default function BrandsPage() {
    const { currency } = useUtil();
    const [brands, setBrands] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedBrandId, setSelectedBrandId] = useState("");
    const [isEditing, setIsEditing] = useState(false);
    const [brandForm, setBrandForm] = useState({ name: "", slug: "" });

    // Products in selected brand
    const [products, setProducts] = useState([]);
    const [productsLoading, setProductsLoading] = useState(false);
    const [selectedProductIds, setSelectedProductIds] = useState(new Set());
    const [moveTargetBrandId, setMoveTargetBrandId] = useState("");

    // Merge
    const [mergeSearch, setMergeSearch] = useState("");
    const [mergeSelection, setMergeSelection] = useState(new Set());
    const [isMergeOpen, setIsMergeOpen] = useState(false);

    // Search / filter
    const [searchTerm, setSearchTerm] = useState("");

    // Add product search
    const [productSearch, setProductSearch] = useState("");
    const [productSearchResults, setProductSearchResults] = useState([]);
    const [productSearchLoading, setProductSearchLoading] = useState(false);

    useEffect(() => {
        loadBrands();
    }, []);

    useEffect(() => {
        if (selectedBrandId) {
            loadProducts();
        } else {
            setProducts([]);
            setSelectedProductIds(new Set());
        }
    }, [selectedBrandId]);

    useEffect(() => {
        const searchValue = productSearch.trim();
        if (!searchValue || searchValue.length < 2) {
            setProductSearchResults([]);
            return;
        }

        let isActive = true;
        const timer = setTimeout(async () => {
            setProductSearchLoading(true);
            try {
                const res = await authApi.fetch("/products", {
                    sort: ["name:asc"],
                    filters: {
                        $or: [
                            { name: { $containsi: searchValue } },
                            { sku: { $containsi: searchValue } },
                            { barcode: { $containsi: searchValue } }
                        ]
                    },
                    populate: { brands: true },
                    pagination: { page: 1, pageSize: 20 }
                });
                const data = res?.data ?? res;
                if (isActive) setProductSearchResults(data || []);
            } catch (error) {
                console.error("Failed to search products", error);
                if (isActive) setProductSearchResults([]);
            } finally {
                if (isActive) setProductSearchLoading(false);
            }
        }, 300);

        return () => {
            isActive = false;
            clearTimeout(timer);
        };
    }, [productSearch]);

    function getEntryId(entry) {
        return entry?.documentId || entry?.id;
    }

    async function loadBrands() {
        setLoading(true);
        try {
            let allBrands = [];
            let page = 1;
            let totalPages = 1;
            do {
                const res = await authApi.fetch("/brands", {
                    sort: ["name:asc"],
                    populate: { logo: true, gallery: true },
                    pagination: { page, pageSize: 100 }
                });
                const data = res?.data ?? res;
                allBrands = [...allBrands, ...(data || [])];
                totalPages = res?.meta?.pagination?.pageCount || 1;
                page++;
            } while (page <= totalPages);

            setBrands(allBrands);

            const existing = allBrands.find(b => getEntryId(b) === selectedBrandId);
            if (!existing && allBrands.length > 0) {
                setSelectedBrandId(getEntryId(allBrands[0]));
            } else if (allBrands.length === 0) {
                setSelectedBrandId("");
            }
        } catch (error) {
            console.error("Failed to load brands", error);
        } finally {
            setLoading(false);
        }
    }

    async function loadProducts() {
        setProductsLoading(true);
        setSelectedProductIds(new Set());
        try {
            let allProducts = [];
            let page = 1;
            let totalPages = 1;
            do {
                const res = await authApi.fetch("/products", {
                    filters: { brands: { documentId: selectedBrandId } },
                    populate: { brands: true },
                    pagination: { page, pageSize: 100 },
                    sort: ["name:asc"]
                });
                const data = res?.data ?? res;
                allProducts = [...allProducts, ...(data || [])];
                totalPages = res?.meta?.pagination?.pageCount || 1;
                page++;
            } while (page <= totalPages);
            setProducts(allProducts);
        } catch (error) {
            console.error("Failed to load products for brand", error);
        } finally {
            setProductsLoading(false);
        }
    }

    // ---- Brand CRUD ----
    function handleFormChange(e) {
        const { name, value } = e.target;
        setBrandForm(prev => ({ ...prev, [name]: value }));
    }

    function handleEditBrand() {
        if (!selectedBrandId) return alert("Select a brand first");
        const selected = brands.find(b => getEntryId(b) === selectedBrandId);
        if (!selected) return;
        setBrandForm({
            name: selected.name || "",
            slug: selected.slug || ""
        });
        setIsEditing(true);
    }

    async function handleSaveBrand(e) {
        e.preventDefault();
        if (!brandForm.name.trim()) return alert("Name is required");
        setLoading(true);
        try {
            const payload = {
                name: brandForm.name.trim(),
                slug: brandForm.slug.trim() || undefined
            };
            if (isEditing && selectedBrandId) {
                await authApi.put(`/brands/${selectedBrandId}`, { data: payload });
            } else {
                const res = await authApi.post("/brands", { data: payload });
                const created = res?.data ?? res;
                setSelectedBrandId(getEntryId(created));
            }
            setIsEditing(false);
            setBrandForm({ name: "", slug: "" });
            await loadBrands();
        } catch (error) {
            console.error("Failed to save brand", error);
            alert("Failed to save brand");
        } finally {
            setLoading(false);
        }
    }

    async function handleDeleteBrand() {
        if (!selectedBrandId) return;
        if (products.length > 0) {
            return alert("Cannot delete a brand that has products. Move or remove products first.");
        }
        if (!confirm("Are you sure you want to delete this brand?")) return;
        setLoading(true);
        try {
            await authApi.del(`/brands/${selectedBrandId}`);
            setSelectedBrandId("");
            await loadBrands();
        } catch (error) {
            console.error("Failed to delete brand", error);
            alert("Failed to delete brand");
        } finally {
            setLoading(false);
        }
    }

    // ---- Merge ----
    function openMergeDialog() {
        if (!selectedBrandId) return alert("Select a target brand first");
        setMergeSearch("");
        setMergeSelection(new Set());
        setIsMergeOpen(true);
    }

    function closeMergeDialog() {
        setIsMergeOpen(false);
        setMergeSearch("");
        setMergeSelection(new Set());
    }

    async function handleMergeBrands() {
        if (!selectedBrandId) return alert("Select a target brand first");
        if (mergeSelection.size === 0) return alert("Select brands to merge");
        if (!confirm(`Merge ${mergeSelection.size} brand(s) into "${selectedBrand?.name}"? Products will be moved and source brands deleted.`)) return;
        setLoading(true);
        try {
            for (const sourceBrandId of mergeSelection) {
                let page = 1;
                let totalPages = 1;
                do {
                    const res = await authApi.fetch("/products", {
                        filters: { brands: { documentId: sourceBrandId } },
                        populate: { brands: true },
                        pagination: { page, pageSize: 100 }
                    });
                    const sourceProducts = res?.data ?? res ?? [];
                    totalPages = res?.meta?.pagination?.pageCount || 1;

                    for (const product of sourceProducts) {
                        const productDocId = getEntryId(product);
                        await authApi.put(`/products/${productDocId}`, {
                            data: {
                                brands: {
                                    connect: [selectedBrandId],
                                    disconnect: [sourceBrandId]
                                }
                            }
                        });
                    }
                    page++;
                } while (page <= totalPages);

                await authApi.del(`/brands/${sourceBrandId}`);
            }

            setMergeSelection(new Set());
            setIsMergeOpen(false);
            await loadBrands();
            await loadProducts();
        } catch (error) {
            console.error("Failed to merge brands", error);
            alert("Failed to merge brands");
        } finally {
            setLoading(false);
        }
    }

    // ---- Move products ----
    function handleSelectProduct(productDocId) {
        setSelectedProductIds(prev => {
            const next = new Set(prev);
            if (next.has(productDocId)) {
                next.delete(productDocId);
            } else {
                next.add(productDocId);
            }
            return next;
        });
    }

    function handleSelectAllProducts() {
        if (selectedProductIds.size === products.length) {
            setSelectedProductIds(new Set());
        } else {
            setSelectedProductIds(new Set(products.map(p => getEntryId(p))));
        }
    }

    async function handleMoveProducts() {
        if (!moveTargetBrandId) return alert("Select a destination brand");
        if (selectedProductIds.size === 0) return alert("Select products to move");
        if (moveTargetBrandId === selectedBrandId) return alert("Destination must be different from source");
        if (!confirm(`Move ${selectedProductIds.size} product(s) from "${selectedBrand?.name}" to "${brands.find(b => getEntryId(b) === moveTargetBrandId)?.name}"?`)) return;
        setLoading(true);
        try {
            for (const productDocId of selectedProductIds) {
                await authApi.put(`/products/${productDocId}`, {
                    data: {
                        brands: {
                            connect: [moveTargetBrandId],
                            disconnect: [selectedBrandId]
                        }
                    }
                });
            }
            setSelectedProductIds(new Set());
            setMoveTargetBrandId("");
            await loadProducts();
        } catch (error) {
            console.error("Failed to move products", error);
            alert("Failed to move products");
        } finally {
            setLoading(false);
        }
    }

    async function handleCopyProducts() {
        if (!moveTargetBrandId) return alert("Select a destination brand");
        if (selectedProductIds.size === 0) return alert("Select products to copy");
        if (moveTargetBrandId === selectedBrandId) return alert("Destination must be different from source");
        setLoading(true);
        try {
            for (const productDocId of selectedProductIds) {
                await authApi.put(`/products/${productDocId}`, {
                    data: {
                        brands: {
                            connect: [moveTargetBrandId]
                        }
                    }
                });
            }
            setSelectedProductIds(new Set());
            setMoveTargetBrandId("");
            alert("Products added to destination brand (kept in source too).");
        } catch (error) {
            console.error("Failed to copy products", error);
            alert("Failed to copy products");
        } finally {
            setLoading(false);
        }
    }

    async function handleRemoveFromBrand(productDocId) {
        if (!confirm("Remove this product from the brand?")) return;
        setLoading(true);
        try {
            await authApi.put(`/products/${productDocId}`, {
                data: {
                    brands: { disconnect: [selectedBrandId] }
                }
            });
            await loadProducts();
        } catch (error) {
            console.error("Failed to remove product from brand", error);
            alert("Failed to remove product");
        } finally {
            setLoading(false);
        }
    }

    async function handleAddProductToBrand(productDocId) {
        if (!selectedBrandId) return alert("Select a brand first");
        setLoading(true);
        try {
            await authApi.put(`/products/${productDocId}`, {
                data: {
                    brands: { connect: [selectedBrandId] }
                }
            });
            await loadProducts();
        } catch (error) {
            console.error("Failed to add product to brand", error);
            alert("Failed to add product to brand");
        } finally {
            setLoading(false);
        }
    }

    function handleMediaChange(field, files, multiple) {
        if (!selectedBrandId) return;
        setBrands(prev => prev.map(b => {
            if (getEntryId(b) !== selectedBrandId) return b;
            return { ...b, [field]: files };
        }));
    }

    // ---- Derived state ----
    const selectedBrand = brands.find(b => getEntryId(b) === selectedBrandId);
    const filteredBrands = brands.filter(b =>
        (b.name || "").toLowerCase().includes(searchTerm.trim().toLowerCase())
    );
    const mergeCandidates = brands.filter(b => getEntryId(b) !== selectedBrandId);
    const filteredMergeCandidates = mergeCandidates.filter(b =>
        (b.name || "").toLowerCase().includes(mergeSearch.trim().toLowerCase())
    );
    const moveTargetOptions = brands.filter(b => getEntryId(b) !== selectedBrandId);

    return (
        <ProtectedRoute>
            <Layout>
                <div className="p-3">
                    <div className="d-flex justify-content-between align-items-center mb-3">
                        <h1 className="mb-0">Brands</h1>
                        {loading && <span className="text-muted">Loading...</span>}
                    </div>

                    <div className="row">
                        {/* Left column: Brands list + Products */}
                        <div className="col-lg-8">
                            {/* Brands list */}
                            <div className="card mb-3">
                                <div className="card-body">
                                    <div className="d-flex flex-wrap justify-content-between align-items-center mb-2">
                                        <h5 className="card-title mb-0">
                                            All Brands
                                            <span className="badge bg-secondary ms-2">{brands.length}</span>
                                        </h5>
                                        <div className="d-flex gap-2">
                                            <button
                                                type="button"
                                                className="btn btn-outline-primary btn-sm"
                                                onClick={handleEditBrand}
                                                disabled={!selectedBrandId}
                                            >
                                                Edit
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-outline-danger btn-sm"
                                                onClick={openMergeDialog}
                                                disabled={!selectedBrandId}
                                            >
                                                Merge into {selectedBrand?.name || "..."}
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-outline-danger btn-sm"
                                                onClick={handleDeleteBrand}
                                                disabled={!selectedBrandId}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                    <input
                                        className="form-control form-control-sm mb-2"
                                        placeholder="Filter brands..."
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                    />
                                    <div className="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-2" style={{ maxHeight: 350, overflowY: "auto" }}>
                                        {filteredBrands.map(brand => {
                                            const id = getEntryId(brand);
                                            const isActive = id === selectedBrandId;
                                            return (
                                                <div key={id} className="col">
                                                    <button
                                                        type="button"
                                                        className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center w-100 ${isActive ? "active" : ""}`}
                                                        onClick={() => setSelectedBrandId(id)}
                                                    >
                                                        <span>{brand.name}</span>
                                                    </button>
                                                </div>
                                            );
                                        })}
                                        {filteredBrands.length === 0 && (
                                            <div className="col">
                                                <div className="list-group-item text-muted">No brands found.</div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Products in selected brand */}
                            <div className="card mb-3">
                                <div className="card-body">
                                    <div className="d-flex flex-wrap justify-content-between align-items-center mb-2">
                                        <h5 className="card-title mb-0">
                                            Products in {selectedBrand?.name || "..."}
                                            <span className="badge bg-secondary ms-2">{products.length}</span>
                                        </h5>
                                        {selectedProductIds.size > 0 && (
                                            <span className="badge bg-primary">{selectedProductIds.size} selected</span>
                                        )}
                                    </div>

                                    {/* Move / Copy toolbar */}
                                    {selectedBrandId && (
                                        <div className="row g-2 mb-2 align-items-end">
                                            <div className="col-sm-5">
                                                <label className="form-label small mb-1">Destination brand</label>
                                                <select
                                                    className="form-select form-select-sm"
                                                    value={moveTargetBrandId}
                                                    onChange={e => setMoveTargetBrandId(e.target.value)}
                                                >
                                                    <option value="">Select brand...</option>
                                                    {moveTargetOptions.map(brand => (
                                                        <option key={getEntryId(brand)} value={getEntryId(brand)}>
                                                            {brand.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="col-auto d-flex gap-2">
                                                <button
                                                    className="btn btn-warning btn-sm"
                                                    onClick={handleMoveProducts}
                                                    disabled={selectedProductIds.size === 0 || !moveTargetBrandId}
                                                >
                                                    Move ({selectedProductIds.size})
                                                </button>
                                                <button
                                                    className="btn btn-info btn-sm"
                                                    onClick={handleCopyProducts}
                                                    disabled={selectedProductIds.size === 0 || !moveTargetBrandId}
                                                >
                                                    Copy ({selectedProductIds.size})
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {productsLoading ? (
                                        <div className="text-muted">Loading products...</div>
                                    ) : !selectedBrandId ? (
                                        <div className="text-muted">Select a brand to view its products.</div>
                                    ) : products.length === 0 ? (
                                        <div className="text-muted">No products in this brand.</div>
                                    ) : (
                                        <div className="table-responsive" style={{ maxHeight: 400, overflowY: "auto" }}>
                                            <table className="table table-sm table-hover mb-0">
                                                <thead className="table-light">
                                                    <tr>
                                                        <th style={{ width: 40 }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedProductIds.size === products.length && products.length > 0}
                                                                onChange={handleSelectAllProducts}
                                                            />
                                                        </th>
                                                        <th>Name</th>
                                                        <th>SKU</th>
                                                        <th>Price</th>
                                                        <th>Brands</th>
                                                        <th style={{ width: 100 }}>Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {products.map(product => {
                                                        const pId = getEntryId(product);
                                                        const isSelected = selectedProductIds.has(pId);
                                                        return (
                                                            <tr key={pId}>
                                                                <td>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={isSelected}
                                                                        onChange={() => handleSelectProduct(pId)}
                                                                    />
                                                                </td>
                                                                <td>
                                                                    <Link href={`/${pId}/product`}>{product.name || "N/A"}</Link>
                                                                </td>
                                                                <td><code>{product.sku || "-"}</code></td>
                                                                <td>{currency}{parseFloat(product.selling_price || 0).toFixed(2)}</td>
                                                                <td>
                                                                    {(product.brands || []).map(b => b.name).join(", ") || "-"}
                                                                </td>
                                                                <td>
                                                                    <button
                                                                        className="btn btn-outline-danger btn-sm"
                                                                        onClick={() => handleRemoveFromBrand(pId)}
                                                                        title="Remove from this brand"
                                                                    >
                                                                        Remove
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Right column: Create / Edit form */}
                        <div className="col-lg-4">
                            <div className="card mb-3">
                                <div className="card-body">
                                    <h5 className="card-title">{isEditing ? "Edit Brand" : "Create Brand"}</h5>
                                    <form onSubmit={handleSaveBrand}>
                                        <div className="mb-2">
                                            <label className="form-label small mb-1">Name *</label>
                                            <input
                                                className="form-control"
                                                name="name"
                                                value={brandForm.name}
                                                onChange={handleFormChange}
                                                placeholder="Brand name"
                                                required
                                            />
                                        </div>
                                        <div className="mb-2">
                                            <label className="form-label small mb-1">Slug</label>
                                            <input
                                                className="form-control"
                                                name="slug"
                                                value={brandForm.slug}
                                                onChange={handleFormChange}
                                                placeholder="Slug (auto-generated if empty)"
                                            />
                                        </div>
                                        <div className="d-flex gap-2">
                                            <button className="btn btn-primary" type="submit">
                                                {isEditing ? "Save" : "Create"}
                                            </button>
                                            {isEditing && (
                                                <button
                                                    type="button"
                                                    className="btn btn-outline-secondary"
                                                    onClick={() => {
                                                        setIsEditing(false);
                                                        setBrandForm({ name: "", slug: "" });
                                                    }}
                                                >
                                                    Cancel
                                                </button>
                                            )}
                                        </div>
                                    </form>
                                </div>
                            </div>

                            {/* Search & Add Products */}
                            <div className="card mb-3">
                                <div className="card-body">
                                    <h5 className="card-title">Add Products to {selectedBrand?.name || "..."}</h5>
                                    <input
                                        className="form-control form-control-sm mb-2"
                                        placeholder="Search by name, SKU, or barcode..."
                                        value={productSearch}
                                        onChange={e => setProductSearch(e.target.value)}
                                        disabled={!selectedBrandId}
                                    />
                                    {productSearchLoading && (
                                        <div className="text-muted small mb-2">Searching...</div>
                                    )}
                                    {!selectedBrandId && (
                                        <div className="text-muted small">Select a brand first.</div>
                                    )}
                                    {selectedBrandId && productSearch.trim().length >= 2 && !productSearchLoading && (
                                        <div className="list-group" style={{ maxHeight: 300, overflowY: "auto" }}>
                                            {productSearchResults.map(product => {
                                                const pId = getEntryId(product);
                                                const alreadyInBrand = (product.brands || []).some(
                                                    b => getEntryId(b) === selectedBrandId
                                                );
                                                return (
                                                    <div
                                                        key={pId}
                                                        className="list-group-item d-flex justify-content-between align-items-center"
                                                    >
                                                        <div>
                                                            <div>{product.name || "N/A"}</div>
                                                            <small className="text-muted">
                                                                {product.sku || "-"}
                                                                {product.selling_price ? ` · ${currency}${parseFloat(product.selling_price).toFixed(2)}` : ""}
                                                            </small>
                                                        </div>
                                                        {alreadyInBrand ? (
                                                            <span className="badge bg-success">Added</span>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                className="btn btn-sm btn-outline-primary"
                                                                onClick={() => handleAddProductToBrand(pId)}
                                                            >
                                                                Add
                                                            </button>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                            {productSearchResults.length === 0 && (
                                                <div className="list-group-item text-muted">No products found.</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Brand details card */}
                            {selectedBrand && (
                                <div className="card mb-3">
                                    <div className="card-body">
                                        <h5 className="card-title">Details</h5>
                                        <dl className="mb-0">
                                            <dt className="small text-muted">Name</dt>
                                            <dd>{selectedBrand.name}</dd>
                                            <dt className="small text-muted">Slug</dt>
                                            <dd><code>{selectedBrand.slug || "-"}</code></dd>
                                            <dt className="small text-muted">Products</dt>
                                            <dd>{products.length}</dd>
                                        </dl>
                                    </div>
                                </div>
                            )}

                            {/* Logo & Gallery */}
                            {selectedBrand && (
                                <div className="card mb-3">
                                    <div className="card-body">
                                        <h5 className="card-title">Logo & Gallery</h5>
                                        <div className="mb-3">
                                            <label className="form-label small mb-1 fw-bold">Logo</label>
                                            <FileView
                                                onFileChange={handleMediaChange}
                                                single={selectedBrand.logo}
                                                multiple={false}
                                                refName="brand"
                                                refId={selectedBrand.id}
                                                field="logo"
                                                name={selectedBrand.name}
                                            />
                                        </div>
                                        <div>
                                            <label className="form-label small mb-1 fw-bold">Gallery</label>
                                            <FileView
                                                onFileChange={handleMediaChange}
                                                gallery={selectedBrand.gallery || []}
                                                multiple={true}
                                                refName="brand"
                                                refId={selectedBrand.id}
                                                field="gallery"
                                                name={selectedBrand.name}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Merge modal */}
                {isMergeOpen && (
                    <div className="modal show d-block" tabIndex="-1" role="dialog" onClick={closeMergeDialog}>
                        <div
                            className="modal-dialog modal-lg modal-dialog-centered"
                            role="document"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="modal-content">
                                <div className="modal-header">
                                    <h5 className="modal-title">Merge Brands</h5>
                                    <button type="button" className="btn-close" onClick={closeMergeDialog}></button>
                                </div>
                                <div className="modal-body">
                                    <p className="text-muted mb-2">
                                        Target brand: <strong>{selectedBrand?.name}</strong>
                                    </p>
                                    <p className="small text-muted mb-2">
                                        All products from selected brands will be moved to the target. Source brands will be deleted.
                                    </p>
                                    <input
                                        className="form-control mb-2"
                                        placeholder="Search brands..."
                                        value={mergeSearch}
                                        onChange={e => setMergeSearch(e.target.value)}
                                    />
                                    <div className="list-group" style={{ maxHeight: 300, overflowY: "auto" }}>
                                        {filteredMergeCandidates.map(brand => {
                                            const brandId = getEntryId(brand);
                                            const isSelected = mergeSelection.has(brandId);
                                            return (
                                                <button
                                                    key={brandId}
                                                    type="button"
                                                    className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center ${isSelected ? "active" : ""}`}
                                                    onClick={() => {
                                                        setMergeSelection(prev => {
                                                            const next = new Set(prev);
                                                            if (next.has(brandId)) next.delete(brandId);
                                                            else next.add(brandId);
                                                            return next;
                                                        });
                                                    }}
                                                >
                                                    <span>{brand.name}</span>
                                                </button>
                                            );
                                        })}
                                        {filteredMergeCandidates.length === 0 && (
                                            <div className="list-group-item text-muted">No brands found.</div>
                                        )}
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <span className="me-auto text-muted small">{mergeSelection.size} selected</span>
                                    <button type="button" className="btn btn-secondary" onClick={closeMergeDialog}>
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-danger"
                                        onClick={handleMergeBrands}
                                        disabled={mergeSelection.size === 0}
                                    >
                                        Merge {mergeSelection.size} into {selectedBrand?.name}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}
