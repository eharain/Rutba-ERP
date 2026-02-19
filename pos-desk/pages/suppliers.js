import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Layout from "../components/Layout";
import ProtectedRoute from "../components/ProtectedRoute";
import { authApi } from "../lib/api";
import { useUtil } from "../context/UtilContext";
import FileView from "../components/FileView";

export default function SuppliersPage() {
    const { currency } = useUtil();
    const [suppliers, setSuppliers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedSupplierId, setSelectedSupplierId] = useState("");
    const [isEditing, setIsEditing] = useState(false);
    const [supplierForm, setSupplierForm] = useState({ name: "", contact_person: "", phone: "", email: "", address: "" });

    // Products in selected supplier
    const [products, setProducts] = useState([]);
    const [productsLoading, setProductsLoading] = useState(false);
    const [selectedProductIds, setSelectedProductIds] = useState(new Set());
    const [moveTargetSupplierId, setMoveTargetSupplierId] = useState("");

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
        loadSuppliers();
    }, []);

    useEffect(() => {
        if (selectedSupplierId) {
            loadProducts();
        } else {
            setProducts([]);
            setSelectedProductIds(new Set());
        }
    }, [selectedSupplierId]);

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
                    populate: { suppliers: true },
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

    async function loadSuppliers() {
        setLoading(true);
        try {
            let allSuppliers = [];
            let page = 1;
            let totalPages = 1;
            do {
                const res = await authApi.fetch("/suppliers", {
                    sort: ["name:asc"],
                    populate: { logo: true, gallery: true },
                    pagination: { page, pageSize: 100 }
                });
                const data = res?.data ?? res;
                allSuppliers = [...allSuppliers, ...(data || [])];
                totalPages = res?.meta?.pagination?.pageCount || 1;
                page++;
            } while (page <= totalPages);

            setSuppliers(allSuppliers);

            const existing = allSuppliers.find(s => getEntryId(s) === selectedSupplierId);
            if (!existing && allSuppliers.length > 0) {
                setSelectedSupplierId(getEntryId(allSuppliers[0]));
            } else if (allSuppliers.length === 0) {
                setSelectedSupplierId("");
            }
        } catch (error) {
            console.error("Failed to load suppliers", error);
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
                    filters: { suppliers: { documentId: selectedSupplierId } },
                    populate: { suppliers: true },
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
            console.error("Failed to load products for supplier", error);
        } finally {
            setProductsLoading(false);
        }
    }

    // ---- Supplier CRUD ----
    function handleFormChange(e) {
        const { name, value } = e.target;
        setSupplierForm(prev => ({ ...prev, [name]: value }));
    }

    function handleEditSupplier() {
        if (!selectedSupplierId) return alert("Select a supplier first");
        const selected = suppliers.find(s => getEntryId(s) === selectedSupplierId);
        if (!selected) return;
        setSupplierForm({
            name: selected.name || "",
            contact_person: selected.contact_person || "",
            phone: selected.phone || "",
            email: selected.email || "",
            address: selected.address || ""
        });
        setIsEditing(true);
    }

    async function handleSaveSupplier(e) {
        e.preventDefault();
        if (!supplierForm.name.trim()) return alert("Name is required");
        setLoading(true);
        try {
            const payload = {
                name: supplierForm.name.trim(),
                contact_person: supplierForm.contact_person.trim() || undefined,
                phone: supplierForm.phone.trim() || undefined,
                email: supplierForm.email.trim() || undefined,
                address: supplierForm.address.trim() || undefined
            };
            if (isEditing && selectedSupplierId) {
                await authApi.put(`/suppliers/${selectedSupplierId}`, { data: payload });
            } else {
                const res = await authApi.post("/suppliers", { data: payload });
                const created = res?.data ?? res;
                setSelectedSupplierId(getEntryId(created));
            }
            setIsEditing(false);
            setSupplierForm({ name: "", contact_person: "", phone: "", email: "", address: "" });
            await loadSuppliers();
        } catch (error) {
            console.error("Failed to save supplier", error);
            alert("Failed to save supplier");
        } finally {
            setLoading(false);
        }
    }

    async function handleDeleteSupplier() {
        if (!selectedSupplierId) return;
        if (products.length > 0) {
            return alert("Cannot delete a supplier that has products. Move or remove products first.");
        }
        if (!confirm("Are you sure you want to delete this supplier?")) return;
        setLoading(true);
        try {
            await authApi.del(`/suppliers/${selectedSupplierId}`);
            setSelectedSupplierId("");
            await loadSuppliers();
        } catch (error) {
            console.error("Failed to delete supplier", error);
            alert("Failed to delete supplier");
        } finally {
            setLoading(false);
        }
    }

    // ---- Merge ----
    function openMergeDialog() {
        if (!selectedSupplierId) return alert("Select a target supplier first");
        setMergeSearch("");
        setMergeSelection(new Set());
        setIsMergeOpen(true);
    }

    function closeMergeDialog() {
        setIsMergeOpen(false);
        setMergeSearch("");
        setMergeSelection(new Set());
    }

    async function handleMergeSuppliers() {
        if (!selectedSupplierId) return alert("Select a target supplier first");
        if (mergeSelection.size === 0) return alert("Select suppliers to merge");
        if (!confirm(`Merge ${mergeSelection.size} supplier(s) into "${selectedSupplier?.name}"? Products will be moved and source suppliers deleted.`)) return;
        setLoading(true);
        try {
            for (const sourceSupplierId of mergeSelection) {
                let page = 1;
                let totalPages = 1;
                do {
                    const res = await authApi.fetch("/products", {
                        filters: { suppliers: { documentId: sourceSupplierId } },
                        populate: { suppliers: true },
                        pagination: { page, pageSize: 100 }
                    });
                    const sourceProducts = res?.data ?? res ?? [];
                    totalPages = res?.meta?.pagination?.pageCount || 1;

                    for (const product of sourceProducts) {
                        const productDocId = getEntryId(product);
                        await authApi.put(`/products/${productDocId}`, {
                            data: {
                                suppliers: {
                                    connect: [selectedSupplierId],
                                    disconnect: [sourceSupplierId]
                                }
                            }
                        });
                    }
                    page++;
                } while (page <= totalPages);

                await authApi.del(`/suppliers/${sourceSupplierId}`);
            }

            setMergeSelection(new Set());
            setIsMergeOpen(false);
            await loadSuppliers();
            await loadProducts();
        } catch (error) {
            console.error("Failed to merge suppliers", error);
            alert("Failed to merge suppliers");
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
        if (!moveTargetSupplierId) return alert("Select a destination supplier");
        if (selectedProductIds.size === 0) return alert("Select products to move");
        if (moveTargetSupplierId === selectedSupplierId) return alert("Destination must be different from source");
        if (!confirm(`Move ${selectedProductIds.size} product(s) from "${selectedSupplier?.name}" to "${suppliers.find(s => getEntryId(s) === moveTargetSupplierId)?.name}"?`)) return;
        setLoading(true);
        try {
            for (const productDocId of selectedProductIds) {
                await authApi.put(`/products/${productDocId}`, {
                    data: {
                        suppliers: {
                            connect: [moveTargetSupplierId],
                            disconnect: [selectedSupplierId]
                        }
                    }
                });
            }
            setSelectedProductIds(new Set());
            setMoveTargetSupplierId("");
            await loadProducts();
        } catch (error) {
            console.error("Failed to move products", error);
            alert("Failed to move products");
        } finally {
            setLoading(false);
        }
    }

    async function handleCopyProducts() {
        if (!moveTargetSupplierId) return alert("Select a destination supplier");
        if (selectedProductIds.size === 0) return alert("Select products to copy");
        if (moveTargetSupplierId === selectedSupplierId) return alert("Destination must be different from source");
        setLoading(true);
        try {
            for (const productDocId of selectedProductIds) {
                await authApi.put(`/products/${productDocId}`, {
                    data: {
                        suppliers: {
                            connect: [moveTargetSupplierId]
                        }
                    }
                });
            }
            setSelectedProductIds(new Set());
            setMoveTargetSupplierId("");
            alert("Products added to destination supplier (kept in source too).");
        } catch (error) {
            console.error("Failed to copy products", error);
            alert("Failed to copy products");
        } finally {
            setLoading(false);
        }
    }

    async function handleRemoveFromSupplier(productDocId) {
        if (!confirm("Remove this product from the supplier?")) return;
        setLoading(true);
        try {
            await authApi.put(`/products/${productDocId}`, {
                data: {
                    suppliers: { disconnect: [selectedSupplierId] }
                }
            });
            await loadProducts();
        } catch (error) {
            console.error("Failed to remove product from supplier", error);
            alert("Failed to remove product");
        } finally {
            setLoading(false);
        }
    }

    async function handleAddProductToSupplier(productDocId) {
        if (!selectedSupplierId) return alert("Select a supplier first");
        setLoading(true);
        try {
            await authApi.put(`/products/${productDocId}`, {
                data: {
                    suppliers: { connect: [selectedSupplierId] }
                }
            });
            await loadProducts();
        } catch (error) {
            console.error("Failed to add product to supplier", error);
            alert("Failed to add product to supplier");
        } finally {
            setLoading(false);
        }
    }

    function handleMediaChange(field, files, multiple) {
        if (!selectedSupplierId) return;
        setSuppliers(prev => prev.map(s => {
            if (getEntryId(s) !== selectedSupplierId) return s;
            return { ...s, [field]: files };
        }));
    }

    // ---- Derived state ----
    const selectedSupplier = suppliers.find(s => getEntryId(s) === selectedSupplierId);
    const filteredSuppliers = suppliers.filter(s =>
        (s.name || "").toLowerCase().includes(searchTerm.trim().toLowerCase())
    );
    const mergeCandidates = suppliers.filter(s => getEntryId(s) !== selectedSupplierId);
    const filteredMergeCandidates = mergeCandidates.filter(s =>
        (s.name || "").toLowerCase().includes(mergeSearch.trim().toLowerCase())
    );
    const moveTargetOptions = suppliers.filter(s => getEntryId(s) !== selectedSupplierId);

    return (
        <ProtectedRoute>
            <Layout>
                <div className="p-3">
                    <div className="d-flex justify-content-between align-items-center mb-3">
                        <h1 className="mb-0">Suppliers</h1>
                        {loading && <span className="text-muted">Loading...</span>}
                    </div>

                    <div className="row">
                        {/* Left column: Suppliers list + Products */}
                        <div className="col-lg-8">
                            {/* Suppliers list */}
                            <div className="card mb-3">
                                <div className="card-body">
                                    <div className="d-flex flex-wrap justify-content-between align-items-center mb-2">
                                        <h5 className="card-title mb-0">
                                            All Suppliers
                                            <span className="badge bg-secondary ms-2">{suppliers.length}</span>
                                        </h5>
                                        <div className="d-flex gap-2">
                                            <button
                                                type="button"
                                                className="btn btn-outline-primary btn-sm"
                                                onClick={handleEditSupplier}
                                                disabled={!selectedSupplierId}
                                            >
                                                Edit
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-outline-danger btn-sm"
                                                onClick={openMergeDialog}
                                                disabled={!selectedSupplierId}
                                            >
                                                Merge into {selectedSupplier?.name || "..."}
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-outline-danger btn-sm"
                                                onClick={handleDeleteSupplier}
                                                disabled={!selectedSupplierId}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                    <input
                                        className="form-control form-control-sm mb-2"
                                        placeholder="Filter suppliers..."
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                    />
                                    <div className="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-2" style={{ maxHeight: 350, overflowY: "auto" }}>
                                        {filteredSuppliers.map(supplier => {
                                            const id = getEntryId(supplier);
                                            const isActive = id === selectedSupplierId;
                                            return (
                                                <div key={id} className="col">
                                                    <button
                                                        type="button"
                                                        className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center w-100 ${isActive ? "active" : ""}`}
                                                        onClick={() => setSelectedSupplierId(id)}
                                                    >
                                                        <span>{supplier.name}</span>
                                                    </button>
                                                </div>
                                            );
                                        })}
                                        {filteredSuppliers.length === 0 && (
                                            <div className="col">
                                                <div className="list-group-item text-muted">No suppliers found.</div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Products in selected supplier */}
                            <div className="card mb-3">
                                <div className="card-body">
                                    <div className="d-flex flex-wrap justify-content-between align-items-center mb-2">
                                        <h5 className="card-title mb-0">
                                            Products in {selectedSupplier?.name || "..."}
                                            <span className="badge bg-secondary ms-2">{products.length}</span>
                                        </h5>
                                        {selectedProductIds.size > 0 && (
                                            <span className="badge bg-primary">{selectedProductIds.size} selected</span>
                                        )}
                                    </div>

                                    {/* Move / Copy toolbar */}
                                    {selectedSupplierId && (
                                        <div className="row g-2 mb-2 align-items-end">
                                            <div className="col-sm-5">
                                                <label className="form-label small mb-1">Destination supplier</label>
                                                <select
                                                    className="form-select form-select-sm"
                                                    value={moveTargetSupplierId}
                                                    onChange={e => setMoveTargetSupplierId(e.target.value)}
                                                >
                                                    <option value="">Select supplier...</option>
                                                    {moveTargetOptions.map(supplier => (
                                                        <option key={getEntryId(supplier)} value={getEntryId(supplier)}>
                                                            {supplier.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="col-auto d-flex gap-2">
                                                <button
                                                    className="btn btn-warning btn-sm"
                                                    onClick={handleMoveProducts}
                                                    disabled={selectedProductIds.size === 0 || !moveTargetSupplierId}
                                                >
                                                    Move ({selectedProductIds.size})
                                                </button>
                                                <button
                                                    className="btn btn-info btn-sm"
                                                    onClick={handleCopyProducts}
                                                    disabled={selectedProductIds.size === 0 || !moveTargetSupplierId}
                                                >
                                                    Copy ({selectedProductIds.size})
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {productsLoading ? (
                                        <div className="text-muted">Loading products...</div>
                                    ) : !selectedSupplierId ? (
                                        <div className="text-muted">Select a supplier to view its products.</div>
                                    ) : products.length === 0 ? (
                                        <div className="text-muted">No products in this supplier.</div>
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
                                                        <th>Suppliers</th>
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
                                                                    {(product.suppliers || []).map(s => s.name).join(", ") || "-"}
                                                                </td>
                                                                <td>
                                                                    <button
                                                                        className="btn btn-outline-danger btn-sm"
                                                                        onClick={() => handleRemoveFromSupplier(pId)}
                                                                        title="Remove from this supplier"
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
                                    <h5 className="card-title">{isEditing ? "Edit Supplier" : "Create Supplier"}</h5>
                                    <form onSubmit={handleSaveSupplier}>
                                        <div className="mb-2">
                                            <label className="form-label small mb-1">Name *</label>
                                            <input
                                                className="form-control"
                                                name="name"
                                                value={supplierForm.name}
                                                onChange={handleFormChange}
                                                placeholder="Supplier name"
                                                required
                                            />
                                        </div>
                                        <div className="mb-2">
                                            <label className="form-label small mb-1">Contact Person</label>
                                            <input
                                                className="form-control"
                                                name="contact_person"
                                                value={supplierForm.contact_person}
                                                onChange={handleFormChange}
                                                placeholder="Contact person"
                                            />
                                        </div>
                                        <div className="mb-2">
                                            <label className="form-label small mb-1">Phone</label>
                                            <input
                                                className="form-control"
                                                name="phone"
                                                value={supplierForm.phone}
                                                onChange={handleFormChange}
                                                placeholder="Phone number"
                                            />
                                        </div>
                                        <div className="mb-2">
                                            <label className="form-label small mb-1">Email</label>
                                            <input
                                                className="form-control"
                                                name="email"
                                                type="email"
                                                value={supplierForm.email}
                                                onChange={handleFormChange}
                                                placeholder="Email address"
                                            />
                                        </div>
                                        <div className="mb-2">
                                            <label className="form-label small mb-1">Address</label>
                                            <textarea
                                                className="form-control"
                                                name="address"
                                                value={supplierForm.address}
                                                onChange={handleFormChange}
                                                placeholder="Address"
                                                rows={2}
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
                                                        setSupplierForm({ name: "", contact_person: "", phone: "", email: "", address: "" });
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
                                    <h5 className="card-title">Add Products to {selectedSupplier?.name || "..."}</h5>
                                    <input
                                        className="form-control form-control-sm mb-2"
                                        placeholder="Search by name, SKU, or barcode..."
                                        value={productSearch}
                                        onChange={e => setProductSearch(e.target.value)}
                                        disabled={!selectedSupplierId}
                                    />
                                    {productSearchLoading && (
                                        <div className="text-muted small mb-2">Searching...</div>
                                    )}
                                    {!selectedSupplierId && (
                                        <div className="text-muted small">Select a supplier first.</div>
                                    )}
                                    {selectedSupplierId && productSearch.trim().length >= 2 && !productSearchLoading && (
                                        <div className="list-group" style={{ maxHeight: 300, overflowY: "auto" }}>
                                            {productSearchResults.map(product => {
                                                const pId = getEntryId(product);
                                                const alreadyInSupplier = (product.suppliers || []).some(
                                                    s => getEntryId(s) === selectedSupplierId
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
                                                        {alreadyInSupplier ? (
                                                            <span className="badge bg-success">Added</span>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                className="btn btn-sm btn-outline-primary"
                                                                onClick={() => handleAddProductToSupplier(pId)}
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

                            {/* Supplier details card */}
                            {selectedSupplier && (
                                <div className="card mb-3">
                                    <div className="card-body">
                                        <h5 className="card-title">Details</h5>
                                        <dl className="mb-0">
                                            <dt className="small text-muted">Name</dt>
                                            <dd>{selectedSupplier.name}</dd>
                                            {selectedSupplier.contact_person && (
                                                <>
                                                    <dt className="small text-muted">Contact Person</dt>
                                                    <dd>{selectedSupplier.contact_person}</dd>
                                                </>
                                            )}
                                            {selectedSupplier.phone && (
                                                <>
                                                    <dt className="small text-muted">Phone</dt>
                                                    <dd>{selectedSupplier.phone}</dd>
                                                </>
                                            )}
                                            {selectedSupplier.email && (
                                                <>
                                                    <dt className="small text-muted">Email</dt>
                                                    <dd>{selectedSupplier.email}</dd>
                                                </>
                                            )}
                                            {selectedSupplier.address && (
                                                <>
                                                    <dt className="small text-muted">Address</dt>
                                                    <dd>{selectedSupplier.address}</dd>
                                                </>
                                            )}
                                            <dt className="small text-muted">Products</dt>
                                            <dd>{products.length}</dd>
                                        </dl>
                                    </div>
                                </div>
                            )}

                            {/* Logo & Gallery */}
                            {selectedSupplier && (
                                <div className="card mb-3">
                                    <div className="card-body">
                                        <h5 className="card-title">Logo & Gallery</h5>
                                        <div className="mb-3">
                                            <label className="form-label small mb-1 fw-bold">Logo</label>
                                            <FileView
                                                onFileChange={handleMediaChange}
                                                single={selectedSupplier.logo}
                                                multiple={false}
                                                refName="supplier"
                                                refId={selectedSupplier.id}
                                                field="logo"
                                                name={selectedSupplier.name}
                                            />
                                        </div>
                                        <div>
                                            <label className="form-label small mb-1 fw-bold">Gallery</label>
                                            <FileView
                                                onFileChange={handleMediaChange}
                                                gallery={selectedSupplier.gallery || []}
                                                multiple={true}
                                                refName="supplier"
                                                refId={selectedSupplier.id}
                                                field="gallery"
                                                name={selectedSupplier.name}
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
                                    <h5 className="modal-title">Merge Suppliers</h5>
                                    <button type="button" className="btn-close" onClick={closeMergeDialog}></button>
                                </div>
                                <div className="modal-body">
                                    <p className="text-muted mb-2">
                                        Target supplier: <strong>{selectedSupplier?.name}</strong>
                                    </p>
                                    <p className="small text-muted mb-2">
                                        All products from selected suppliers will be moved to the target. Source suppliers will be deleted.
                                    </p>
                                    <input
                                        className="form-control mb-2"
                                        placeholder="Search suppliers..."
                                        value={mergeSearch}
                                        onChange={e => setMergeSearch(e.target.value)}
                                    />
                                    <div className="list-group" style={{ maxHeight: 300, overflowY: "auto" }}>
                                        {filteredMergeCandidates.map(supplier => {
                                            const supplierId = getEntryId(supplier);
                                            const isSelected = mergeSelection.has(supplierId);
                                            return (
                                                <button
                                                    key={supplierId}
                                                    type="button"
                                                    className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center ${isSelected ? "active" : ""}`}
                                                    onClick={() => {
                                                        setMergeSelection(prev => {
                                                            const next = new Set(prev);
                                                            if (next.has(supplierId)) next.delete(supplierId);
                                                            else next.add(supplierId);
                                                            return next;
                                                        });
                                                    }}
                                                >
                                                    <span>{supplier.name}</span>
                                                </button>
                                            );
                                        })}
                                        {filteredMergeCandidates.length === 0 && (
                                            <div className="list-group-item text-muted">No suppliers found.</div>
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
                                        onClick={handleMergeSuppliers}
                                        disabled={mergeSelection.size === 0}
                                    >
                                        Merge {mergeSelection.size} into {selectedSupplier?.name}
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
