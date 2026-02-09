import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Layout from "../components/Layout";
import ProtectedRoute from "../components/ProtectedRoute";
import { authApi } from "../lib/api";
import { useUtil } from "../context/UtilContext";

export default function CategoriesPage() {
    const { currency } = useUtil();
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedCategoryId, setSelectedCategoryId] = useState("");
    const [isEditing, setIsEditing] = useState(false);
    const [categoryForm, setCategoryForm] = useState({ name: "", slug: "", summary: "", parent: "" });

    // Products in selected category
    const [products, setProducts] = useState([]);
    const [productsLoading, setProductsLoading] = useState(false);
    const [selectedProductIds, setSelectedProductIds] = useState(new Set());
    const [moveTargetCategoryId, setMoveTargetCategoryId] = useState("");

    // Merge
    const [mergeSearch, setMergeSearch] = useState("");
    const [mergeSelection, setMergeSelection] = useState(new Set());
    const [isMergeOpen, setIsMergeOpen] = useState(false);

    // Search / filter
    const [searchTerm, setSearchTerm] = useState(""); 

    useEffect(() => {
        loadCategories();
    }, []);

    useEffect(() => {
        if (selectedCategoryId) {
            loadProducts();
        } else {
            setProducts([]);
            setSelectedProductIds(new Set());
        }
    }, [selectedCategoryId]);

    function getEntryId(entry) {
        return entry?.documentId || entry?.id;
    }

    async function loadCategories() {
        setLoading(true);
        try {
            let allCategories = [];
            let page = 1;
            let totalPages = 1;
            do {
                const res = await authApi.fetch("/categories", {
                    sort: ["name:asc"],
                    populate: { parent: true, childern: true },
                    pagination: { page, pageSize: 100 }
                });
                const data = res?.data ?? res;
                allCategories = [...allCategories, ...(data || [])];
                totalPages = res?.meta?.pagination?.pageCount || 1;
                page++;
            } while (page <= totalPages);

            setCategories(allCategories);

            const existing = allCategories.find(c => getEntryId(c) === selectedCategoryId);
            if (!existing && allCategories.length > 0) {
                setSelectedCategoryId(getEntryId(allCategories[0]));
            } else if (allCategories.length === 0) {
                setSelectedCategoryId("");
            }
        } catch (error) {
            console.error("Failed to load categories", error);
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
                    filters: { categories: { documentId: selectedCategoryId } },
                    populate: { categories: true },
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
            console.error("Failed to load products for category", error);
        } finally {
            setProductsLoading(false);
        }
    }

    // ---- Category CRUD ----
    function handleFormChange(e) {
        const { name, value } = e.target;
        setCategoryForm(prev => ({ ...prev, [name]: value }));
    }

    function handleEditCategory() {
        if (!selectedCategoryId) return alert("Select a category first");
        const selected = categories.find(c => getEntryId(c) === selectedCategoryId);
        if (!selected) return;
        setCategoryForm({
            name: selected.name || "",
            slug: selected.slug || "",
            summary: selected.summary || "",
            parent: getEntryId(selected.parent) || ""
        });
        setIsEditing(true);
    }

    async function handleSaveCategory(e) {
        e.preventDefault();
        if (!categoryForm.name.trim()) return alert("Name is required");
        setLoading(true);
        try {
            const payload = {
                name: categoryForm.name.trim(),
                slug: categoryForm.slug.trim() || undefined,
                summary: categoryForm.summary.trim() || undefined,
                parent: categoryForm.parent ? { connect: [categoryForm.parent] } : { disconnect: true }
            };
            if (isEditing && selectedCategoryId) {
                await authApi.put(`/categories/${selectedCategoryId}`, { data: payload });
            } else {
                const res = await authApi.post("/categories", { data: payload });
                const created = res?.data ?? res;
                setSelectedCategoryId(getEntryId(created));
            }
            setIsEditing(false);
            setCategoryForm({ name: "", slug: "", summary: "", parent: "" });
            await loadCategories();
        } catch (error) {
            console.error("Failed to save category", error);
            alert("Failed to save category");
        } finally {
            setLoading(false);
        }
    }

    async function handleDeleteCategory() {
        if (!selectedCategoryId) return;
        if (products.length > 0) {
            return alert("Cannot delete a category that has products. Move or remove products first.");
        }
        if (!confirm("Are you sure you want to delete this category?")) return;
        setLoading(true);
        try {
            await authApi.del(`/categories/${selectedCategoryId}`);
            setSelectedCategoryId("");
            await loadCategories();
        } catch (error) {
            console.error("Failed to delete category", error);
            alert("Failed to delete category");
        } finally {
            setLoading(false);
        }
    }

    // ---- Merge ----
    function openMergeDialog() {
        if (!selectedCategoryId) return alert("Select a target category first");
        setMergeSearch("");
        setMergeSelection(new Set());
        setIsMergeOpen(true);
    }

    function closeMergeDialog() {
        setIsMergeOpen(false);
        setMergeSearch("");
        setMergeSelection(new Set());
    }

    async function handleMergeCategories() {
        if (!selectedCategoryId) return alert("Select a target category first");
        if (mergeSelection.size === 0) return alert("Select categories to merge");
        if (!confirm(`Merge ${mergeSelection.size} category(ies) into "${selectedCategory?.name}"? Products will be moved and source categories deleted.`)) return;
        setLoading(true);
        try {
            // For each source category, find its products and connect them to target
            for (const sourceCatId of mergeSelection) {
                let page = 1;
                let totalPages = 1;
                do {
                    const res = await authApi.fetch("/products", {
                        filters: { categories: { documentId: sourceCatId } },
                        populate: { categories: true },
                        pagination: { page, pageSize: 100 }
                    });
                    const sourceProducts = res?.data ?? res ?? [];
                    totalPages = res?.meta?.pagination?.pageCount || 1;

                    for (const product of sourceProducts) {
                        const productDocId = getEntryId(product);
                        await authApi.put(`/products/${productDocId}`, {
                            data: {
                                categories: {
                                    connect: [selectedCategoryId],
                                    disconnect: [sourceCatId]
                                }
                            }
                        });
                    }
                    page++;
                } while (page <= totalPages);

                // Also move children categories to target's parent (or make them root)
                const sourceCat = categories.find(c => getEntryId(c) === sourceCatId);
                const sourceChildren = sourceCat?.childern || [];
                for (const child of sourceChildren) {
                    const childId = getEntryId(child);
                    await authApi.put(`/categories/${childId}`, {
                        data: { parent: { connect: [selectedCategoryId] } }
                    });
                }

                // Delete the source category
                await authApi.del(`/categories/${sourceCatId}`);
            }

            setMergeSelection(new Set());
            setIsMergeOpen(false);
            await loadCategories();
            await loadProducts();
        } catch (error) {
            console.error("Failed to merge categories", error);
            alert("Failed to merge categories");
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
        if (!moveTargetCategoryId) return alert("Select a destination category");
        if (selectedProductIds.size === 0) return alert("Select products to move");
        if (moveTargetCategoryId === selectedCategoryId) return alert("Destination must be different from source");
        if (!confirm(`Move ${selectedProductIds.size} product(s) from "${selectedCategory?.name}" to "${categories.find(c => getEntryId(c) === moveTargetCategoryId)?.name}"?`)) return;
        setLoading(true);
        try {
            for (const productDocId of selectedProductIds) {
                await authApi.put(`/products/${productDocId}`, {
                    data: {
                        categories: {
                            connect: [moveTargetCategoryId],
                            disconnect: [selectedCategoryId]
                        }
                    }
                });
            }
            setSelectedProductIds(new Set());
            setMoveTargetCategoryId("");
            await loadProducts();
        } catch (error) {
            console.error("Failed to move products", error);
            alert("Failed to move products");
        } finally {
            setLoading(false);
        }
    }

    async function handleCopyProducts() {
        if (!moveTargetCategoryId) return alert("Select a destination category");
        if (selectedProductIds.size === 0) return alert("Select products to copy");
        if (moveTargetCategoryId === selectedCategoryId) return alert("Destination must be different from source");
        setLoading(true);
        try {
            for (const productDocId of selectedProductIds) {
                await authApi.put(`/products/${productDocId}`, {
                    data: {
                        categories: {
                            connect: [moveTargetCategoryId]
                        }
                    }
                });
            }
            setSelectedProductIds(new Set());
            setMoveTargetCategoryId("");
            alert("Products added to destination category (kept in source too).");
        } catch (error) {
            console.error("Failed to copy products", error);
            alert("Failed to copy products");
        } finally {
            setLoading(false);
        }
    }

    async function handleRemoveFromCategory(productDocId) {
        if (!confirm("Remove this product from the category?")) return;
        setLoading(true);
        try {
            await authApi.put(`/products/${productDocId}`, {
                data: {
                    categories: { disconnect: [selectedCategoryId] }
                }
            });
            await loadProducts();
        } catch (error) {
            console.error("Failed to remove product from category", error);
            alert("Failed to remove product");
        } finally {
            setLoading(false);
        }
    }

    // ---- Derived state ----
    const selectedCategory = categories.find(c => getEntryId(c) === selectedCategoryId);
    const filteredCategories = categories.filter(c =>
        (c.name || "").toLowerCase().includes(searchTerm.trim().toLowerCase())
    );
    const mergeCandidates = categories.filter(c => getEntryId(c) !== selectedCategoryId);
    const filteredMergeCandidates = mergeCandidates.filter(c =>
        (c.name || "").toLowerCase().includes(mergeSearch.trim().toLowerCase())
    );
    const moveTargetOptions = categories.filter(c => getEntryId(c) !== selectedCategoryId);
    const parentOptions = categories.filter(c => getEntryId(c) !== selectedCategoryId);

    return (
        <ProtectedRoute>
            <Layout>
                <div className="p-3">
                    <div className="d-flex justify-content-between align-items-center mb-3">
                        <h1 className="mb-0">Categories</h1>
                        {loading && <span className="text-muted">Loading...</span>}
                    </div>

                    <div className="row">
                        {/* Left column: Categories list + Products */}
                        <div className="col-lg-8">
                            {/* Categories list */}
                            <div className="card mb-3">
                                <div className="card-body">
                                    <div className="d-flex flex-wrap justify-content-between align-items-center mb-2">
                                        <h5 className="card-title mb-0">
                                            All Categories
                                            <span className="badge bg-secondary ms-2">{categories.length}</span>
                                        </h5>
                                        <div className="d-flex gap-2">
                                            <button
                                                type="button"
                                                className="btn btn-outline-primary btn-sm"
                                                onClick={handleEditCategory}
                                                disabled={!selectedCategoryId}
                                            >
                                                Edit
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-outline-danger btn-sm"
                                                onClick={openMergeDialog}
                                                disabled={!selectedCategoryId}
                                            >
                                                Merge into {selectedCategory?.name || "..."}
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-outline-danger btn-sm"
                                                onClick={handleDeleteCategory}
                                                disabled={!selectedCategoryId}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                    <input
                                        className="form-control form-control-sm mb-2"
                                        placeholder="Filter categories..."
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                    />
                                    <div className="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-2" style={{ maxHeight: 350, overflowY: "auto" }}>
                                        {filteredCategories.map(cat => {
                                            const id = getEntryId(cat);
                                            const isActive = id === selectedCategoryId;
                                            return (
                                                <div key={id} className="col">
                                                    <button
                                                        type="button"
                                                        className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center w-100 ${isActive ? "active" : ""}`}
                                                        onClick={() => setSelectedCategoryId(id)}
                                                    >
                                                        <span>
                                                            {cat.name}
                                                            {cat.parent && (
                                                                <small className={`ms-1 ${isActive ? "text-light" : "text-muted"}`}>
                                                                    ({cat.parent.name})
                                                                </small>
                                                            )}
                                                        </span>
                                                        <span className={`badge ${isActive ? "bg-light text-dark" : "bg-secondary"}`}>
                                                            {cat.childern?.length || 0}
                                                        </span>
                                                    </button>
                                                </div>
                                            );
                                        })}
                                        {filteredCategories.length === 0 && (
                                            <div className="col">
                                                <div className="list-group-item text-muted">No categories found.</div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Products in selected category */}
                            <div className="card mb-3">
                                <div className="card-body">
                                    <div className="d-flex flex-wrap justify-content-between align-items-center mb-2">
                                        <h5 className="card-title mb-0">
                                            Products in {selectedCategory?.name || "..."}
                                            <span className="badge bg-secondary ms-2">{products.length}</span>
                                        </h5>
                                        {selectedProductIds.size > 0 && (
                                            <span className="badge bg-primary">{selectedProductIds.size} selected</span>
                                        )}
                                    </div>

                                    {/* Move / Copy toolbar */}
                                    {selectedCategoryId && (
                                        <div className="row g-2 mb-2 align-items-end">
                                            <div className="col-sm-5">
                                                <label className="form-label small mb-1">Destination category</label>
                                                <select
                                                    className="form-select form-select-sm"
                                                    value={moveTargetCategoryId}
                                                    onChange={e => setMoveTargetCategoryId(e.target.value)}
                                                >
                                                    <option value="">Select category...</option>
                                                    {moveTargetOptions.map(cat => (
                                                        <option key={getEntryId(cat)} value={getEntryId(cat)}>
                                                            {cat.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="col-auto d-flex gap-2">
                                                <button
                                                    className="btn btn-warning btn-sm"
                                                    onClick={handleMoveProducts}
                                                    disabled={selectedProductIds.size === 0 || !moveTargetCategoryId}
                                                >
                                                    Move ({selectedProductIds.size})
                                                </button>
                                                <button
                                                    className="btn btn-info btn-sm"
                                                    onClick={handleCopyProducts}
                                                    disabled={selectedProductIds.size === 0 || !moveTargetCategoryId}
                                                >
                                                    Copy ({selectedProductIds.size})
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {productsLoading ? (
                                        <div className="text-muted">Loading products...</div>
                                    ) : !selectedCategoryId ? (
                                        <div className="text-muted">Select a category to view its products.</div>
                                    ) : products.length === 0 ? (
                                        <div className="text-muted">No products in this category.</div>
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
                                                        <th>Categories</th>
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
                                                                    {(product.categories || []).map(c => c.name).join(", ") || "-"}
                                                                </td>
                                                                <td>
                                                                    <button
                                                                        className="btn btn-outline-danger btn-sm"
                                                                        onClick={() => handleRemoveFromCategory(pId)}
                                                                        title="Remove from this category"
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
                                    <h5 className="card-title">{isEditing ? "Edit Category" : "Create Category"}</h5>
                                    <form onSubmit={handleSaveCategory}>
                                        <div className="mb-2">
                                            <label className="form-label small mb-1">Name *</label>
                                            <input
                                                className="form-control"
                                                name="name"
                                                value={categoryForm.name}
                                                onChange={handleFormChange}
                                                placeholder="Category name"
                                                required
                                            />
                                        </div>
                                        <div className="mb-2">
                                            <label className="form-label small mb-1">Slug</label>
                                            <input
                                                className="form-control"
                                                name="slug"
                                                value={categoryForm.slug}
                                                onChange={handleFormChange}
                                                placeholder="Slug (auto-generated if empty)"
                                            />
                                        </div>
                                        <div className="mb-2">
                                            <label className="form-label small mb-1">Summary</label>
                                            <textarea
                                                className="form-control"
                                                name="summary"
                                                value={categoryForm.summary}
                                                onChange={handleFormChange}
                                                placeholder="Short summary"
                                                rows={2}
                                            />
                                        </div>
                                        <div className="mb-2">
                                            <label className="form-label small mb-1">Parent Category</label>
                                            <select
                                                className="form-select"
                                                name="parent"
                                                value={categoryForm.parent}
                                                onChange={handleFormChange}
                                            >
                                                <option value="">None (root category)</option>
                                                {parentOptions.map(cat => (
                                                    <option key={getEntryId(cat)} value={getEntryId(cat)}>
                                                        {cat.name}
                                                    </option>
                                                ))}
                                            </select>
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
                                                        setCategoryForm({ name: "", slug: "", summary: "", parent: "" });
                                                    }}
                                                >
                                                    Cancel
                                                </button>
                                            )}
                                        </div>
                                    </form>
                                </div>
                            </div>

                            {/* Category details card */}
                            {selectedCategory && (
                                <div className="card mb-3">
                                    <div className="card-body">
                                        <h5 className="card-title">Details</h5>
                                        <dl className="mb-0">
                                            <dt className="small text-muted">Name</dt>
                                            <dd>{selectedCategory.name}</dd>
                                            <dt className="small text-muted">Slug</dt>
                                            <dd><code>{selectedCategory.slug || "-"}</code></dd>
                                            {selectedCategory.parent && (
                                                <>
                                                    <dt className="small text-muted">Parent</dt>
                                                    <dd>{selectedCategory.parent.name}</dd>
                                                </>
                                            )}
                                            {selectedCategory.childern?.length > 0 && (
                                                <>
                                                    <dt className="small text-muted">Sub-categories</dt>
                                                    <dd>{selectedCategory.childern.map(c => c.name).join(", ")}</dd>
                                                </>
                                            )}
                                            {selectedCategory.summary && (
                                                <>
                                                    <dt className="small text-muted">Summary</dt>
                                                    <dd>{selectedCategory.summary}</dd>
                                                </>
                                            )}
                                            <dt className="small text-muted">Products</dt>
                                            <dd>{products.length}</dd>
                                        </dl>
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
                                    <h5 className="modal-title">Merge Categories</h5>
                                    <button type="button" className="btn-close" onClick={closeMergeDialog}></button>
                                </div>
                                <div className="modal-body">
                                    <p className="text-muted mb-2">
                                        Target category: <strong>{selectedCategory?.name}</strong>
                                    </p>
                                    <p className="small text-muted mb-2">
                                        All products from selected categories will be moved to the target. Source categories will be deleted.
                                    </p>
                                    <input
                                        className="form-control mb-2"
                                        placeholder="Search categories..."
                                        value={mergeSearch}
                                        onChange={e => setMergeSearch(e.target.value)}
                                    />
                                    <div className="list-group" style={{ maxHeight: 300, overflowY: "auto" }}>
                                        {filteredMergeCandidates.map(cat => {
                                            const catId = getEntryId(cat);
                                            const isSelected = mergeSelection.has(catId);
                                            return (
                                                <button
                                                    key={catId}
                                                    type="button"
                                                    className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center ${isSelected ? "active" : ""}`}
                                                    onClick={() => {
                                                        setMergeSelection(prev => {
                                                            const next = new Set(prev);
                                                            if (next.has(catId)) next.delete(catId);
                                                            else next.add(catId);
                                                            return next;
                                                        });
                                                    }}
                                                >
                                                    <span>{cat.name}</span>
                                                    {cat.parent && (
                                                        <small className={isSelected ? "text-light" : "text-muted"}>
                                                            parent: {cat.parent.name}
                                                        </small>
                                                    )}
                                                </button>
                                            );
                                        })}
                                        {filteredMergeCandidates.length === 0 && (
                                            <div className="list-group-item text-muted">No categories found.</div>
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
                                        onClick={handleMergeCategories}
                                        disabled={mergeSelection.size === 0}
                                    >
                                        Merge {mergeSelection.size} into {selectedCategory?.name}
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
