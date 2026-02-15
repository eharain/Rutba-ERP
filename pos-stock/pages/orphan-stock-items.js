import { useEffect, useState, useRef } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { authApi } from "@rutba/pos-shared/lib/api";

export default function OrphanStockItemsPage() {
    const [items, setItems] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [busyId, setBusyId] = useState(null);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [total, setTotal] = useState(0);
    const [search, setSearch] = useState("");
    const debounceRef = useRef(null);
    const [selected, setSelected] = useState(new Set());
    const [bulkBusy, setBulkBusy] = useState(false);
    const [bulkProgress, setBulkProgress] = useState("");

    useEffect(() => {
        loadOrphans();
    }, [page, pageSize]);

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            setPage(1);
            loadOrphans();
        }, 300);
        return () => clearTimeout(debounceRef.current);
    }, [search]);

    async function loadOrphans() {
        setLoading(true);
        setError("");
        try {
            const params = {
                filters: {
                    product: { id: { $null: true } },
                    ...(search ? { name: { $containsi: search } } : {}),
                },
                pagination: { page, pageSize },
                sort: ["name:asc"],
            };
            const res = await authApi.get("/stock-items", params);
            setItems(res.data || []);
            setTotal(res.meta?.pagination?.total || 0);

            const prodRes = await authApi.get("/products", {
                pagination: { page: 1, pageSize: 200 },
                sort: ["name:asc"],
            });
            setProducts(prodRes.data || []);
        } catch (e) {
            console.error("Failed to load orphan stock items:", e);
            setError("Failed to load data.");
        } finally {
            setLoading(false);
        }
    }

    async function handleCreateProduct(item) {
        setBusyId(item.documentId);
        try {
            const prodRes = await authApi.post("/products", {
                data: {
                    name: item.name,
                    selling_price: item.selling_price,
                    cost_price: item.cost_price,
                    sku: item.sku,
                    barcode: item.barcode,
                },
            });
            const newProductDocId = prodRes.data?.documentId;
            if (newProductDocId) {
                await authApi.put(`/stock-items/${item.documentId}`, {
                    data: { product: { connect: [newProductDocId] } },
                });
            }
            await loadOrphans();
        } catch (e) {
            console.error("Failed to create product:", e);
            setError("Failed to create and link product.");
        } finally {
            setBusyId(null);
        }
    }

    async function handleAttachProduct(item, productDocId) {
        if (!productDocId) return;
        setBusyId(item.documentId);
        try {
            await authApi.put(`/stock-items/${item.documentId}`, {
                data: { product: { connect: [productDocId] } },
            });
            await loadOrphans();
        } catch (e) {
            console.error("Failed to attach product:", e);
            setError("Failed to attach product.");
        } finally {
            setBusyId(null);
        }
    }

    function toggleSelect(docId) {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(docId)) next.delete(docId); else next.add(docId);
            return next;
        });
    }

    function toggleSelectAll() {
        if (selected.size === items.length) {
            setSelected(new Set());
        } else {
            setSelected(new Set(items.map(i => i.documentId)));
        }
    }

    async function handleBulkCreateProducts() {
        const selectedItems = items.filter(i => selected.has(i.documentId));
        if (selectedItems.length === 0) return;
        setBulkBusy(true);
        setError("");
        try {
            const first = selectedItems[0];
            setBulkProgress("Creating product...");
            const prodRes = await authApi.post("/products", {
                data: {
                    name: first.name,
                    selling_price: first.selling_price,
                    cost_price: first.cost_price,
                    sku: first.sku,
                    barcode: first.barcode,
                },
            });
            const newProductDocId = prodRes.data?.documentId;
            if (!newProductDocId) throw new Error("Product creation returned no documentId");

            let done = 0;
            for (const item of selectedItems) {
                done++;
                setBulkProgress(`Linking item ${done} of ${selectedItems.length}...`);
                await authApi.put(`/stock-items/${item.documentId}`, {
                    data: { product: { connect: [newProductDocId] } },
                });
            }
            setSelected(new Set());
            await loadOrphans();
        } catch (e) {
            console.error("Bulk create failed:", e);
            setError("Bulk create & link failed. Some items may have been linked.");
        } finally {
            setBulkBusy(false);
            setBulkProgress("");
        }
    }

    async function handleBulkAttachProduct(productDocId) {
        if (!productDocId) return;
        const selectedItems = items.filter(i => selected.has(i.documentId));
        if (selectedItems.length === 0) return;
        setBulkBusy(true);
        setError("");
        let done = 0;
        try {
            for (const item of selectedItems) {
                done++;
                setBulkProgress(`Attaching item ${done} of ${selectedItems.length}...`);
                await authApi.put(`/stock-items/${item.documentId}`, {
                    data: { product: { connect: [productDocId] } },
                });
            }
            setSelected(new Set());
            await loadOrphans();
        } catch (e) {
            console.error("Bulk attach failed:", e);
            setError(`Bulk attach failed at item ${done}. ${done - 1} items were processed.`);
        } finally {
            setBulkBusy(false);
            setBulkProgress("");
        }
    }

    const totalPages = Math.ceil(total / pageSize) || 1;

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-3">Orphan Stock Items</h2>
                <p className="text-muted">Stock items that are not linked to any product.</p>

                {error && <div className="alert alert-danger">{error}</div>}

                <div className="mb-3 d-flex align-items-center flex-wrap gap-2">
                    <input
                        type="text"
                        className="form-control"
                        placeholder="Search by name..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ maxWidth: 260 }}
                    />
                    <select
                        className="form-select"
                        value={pageSize}
                        onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                        style={{ width: 90 }}
                    >
                        {[10, 25, 50, 100].map(s => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                    <span className="text-muted">
                        {total} item{total !== 1 ? "s" : ""}
                    </span>
                </div>

                {selected.size > 0 && (
                    <div className="alert alert-info d-flex align-items-center flex-wrap gap-2 py-2">
                        <strong>{selected.size} selected</strong>
                        <button
                            className="btn btn-sm btn-primary"
                            onClick={handleBulkCreateProducts}
                            disabled={bulkBusy}
                        >
                            Create Product & Link All
                        </button>
                        <select
                            className="form-select form-select-sm"
                            style={{ width: 200 }}
                            onChange={e => handleBulkAttachProduct(e.target.value)}
                            defaultValue=""
                            disabled={bulkBusy}
                        >
                            <option value="" disabled>Attach all to…</option>
                            {products.map(p => (
                                <option key={p.documentId} value={p.documentId}>{p.name}</option>
                            ))}
                        </select>
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => setSelected(new Set())} disabled={bulkBusy}>
                            Clear
                        </button>
                        {bulkProgress && <span className="text-muted ms-2">{bulkProgress}</span>}
                    </div>
                )}

                {loading && <div className="text-center py-4"><div className="spinner-border" role="status" /></div>}

                {!loading && items.length === 0 && (
                    <div className="alert alert-success">All stock items are linked to a product.</div>
                )}

                {!loading && items.length > 0 && (
                    <>
                        <table className="table table-bordered table-hover">
                            <thead className="table-light">
                                <tr>
                                    <th style={{ width: 40 }}>
                                        <input
                                            type="checkbox"
                                            className="form-check-input"
                                            checked={items.length > 0 && selected.size === items.length}
                                            onChange={toggleSelectAll}
                                            disabled={bulkBusy}
                                        />
                                    </th>
                                    <th>Name</th>
                                    <th>SKU</th>
                                    <th>Selling Price</th>
                                    <th>Cost Price</th>
                                    <th>Status</th>
                                    <th style={{ minWidth: 280 }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map(item => {
                                    const isBusy = busyId === item.documentId;
                                    return (
                                        <tr key={item.documentId} className={selected.has(item.documentId) ? "table-active" : ""}>
                                            <td>
                                                <input
                                                    type="checkbox"
                                                    className="form-check-input"
                                                    checked={selected.has(item.documentId)}
                                                    onChange={() => toggleSelect(item.documentId)}
                                                    disabled={bulkBusy}
                                                />
                                            </td>
                                            <td>{item.name || <span className="text-muted fst-italic">No name</span>}</td>
                                            <td>{item.sku || "—"}</td>
                                            <td>{item.selling_price ?? "—"}</td>
                                            <td>{item.cost_price ?? "—"}</td>
                                            <td><span className={`badge bg-${statusColor(item.status)}`}>{item.status}</span></td>
                                            <td>
                                                <button
                                                    className="btn btn-sm btn-outline-primary me-2"
                                                    onClick={() => handleCreateProduct(item)}
                                                    disabled={isBusy}
                                                >
                                                    {isBusy ? "Working..." : "Create Product"}
                                                </button>
                                                <select
                                                    className="form-select form-select-sm d-inline-block"
                                                    style={{ width: 160 }}
                                                    onChange={e => handleAttachProduct(item, e.target.value)}
                                                    defaultValue=""
                                                    disabled={isBusy}
                                                >
                                                    <option value="" disabled>Attach to…</option>
                                                    {products.map(p => (
                                                        <option key={p.documentId} value={p.documentId}>{p.name}</option>
                                                    ))}
                                                </select>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>

                        <nav className="d-flex justify-content-between align-items-center">
                            <span className="text-muted">
                                Page {page} of {totalPages}
                            </span>
                            <div>
                                <button className="btn btn-sm btn-outline-secondary me-1" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                                    &laquo; Prev
                                </button>
                                <button className="btn btn-sm btn-outline-secondary" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                                    Next &raquo;
                                </button>
                            </div>
                        </nav>
                    </>
                )}
            </Layout>
        </ProtectedRoute>
    );
}

function statusColor(status) {
    switch (status) {
        case "InStock": return "success";
        case "Sold": return "secondary";
        case "Received": return "info";
        case "Reserved": return "warning";
        case "Returned":
        case "ReturnedDamaged":
        case "ReturnedToSupplier": return "primary";
        case "Damaged":
        case "Lost":
        case "Expired": return "danger";
        default: return "light";
    }
}

export async function getServerSideProps() { return { props: {} }; }
