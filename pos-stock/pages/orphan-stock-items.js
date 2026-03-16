import { useEffect, useState, useRef, useMemo } from "react";
import Layout from "../components/Layout";
import ProductPickerModal from "../components/ProductPickerModal";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { authApi } from "@rutba/pos-shared/lib/api";

const STATUS_OPTIONS = [
    "InStock", "Sold", "Received", "Reserved",
    "Returned", "ReturnedDamaged", "ReturnedToSupplier",
    "Damaged", "Lost", "Expired",
];

export default function OrphanStockItemsPage() {
    const [items, setItems] = useState([]);
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
    const [sortField, setSortField] = useState("name");
    const [sortDir, setSortDir] = useState("asc");
    const [statusFilter, setStatusFilter] = useState("");
    const [skuFilter, setSkuFilter] = useState("");
    const [duplicatesOnly, setDuplicatesOnly] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState(new Set());
    const [groupNames, setGroupNames] = useState({});
    const [applyNameToItems, setApplyNameToItems] = useState(new Set());
    const [pickerOpen, setPickerOpen] = useState(false);
    const [pickerTitle, setPickerTitle] = useState("");
    const pickerCallbackRef = useRef(null);

    useEffect(() => {
        loadOrphans();
    }, [page, pageSize, sortField, sortDir, statusFilter, skuFilter]);

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
            const filters = {
                product: { id: { $null: true } },
                ...(search ? { name: { $containsi: search } } : {}),
                ...(statusFilter ? { status: { $eq: statusFilter } } : {}),
            };
            if (skuFilter === "has") filters.sku = { $notNull: true };
            else if (skuFilter === "none") filters.sku = { $null: true };

            const params = {
                filters,
                pagination: { page, pageSize },
                sort: [`${sortField}:${sortDir}`, ...(sortField !== "name" ? ["name:asc"] : [])],
            };
            const res = await authApi.get("/stock-items", params);
            setItems(res.data || []);
            setTotal(res.meta?.pagination?.total || 0);
        } catch (e) {
            console.error("Failed to load orphan stock items:", e);
            setError("Failed to load data.");
        } finally {
            setLoading(false);
        }
    }

    function openProductPicker(title, callback) {
        setPickerTitle(title);
        pickerCallbackRef.current = callback;
        setPickerOpen(true);
    }

    function onPickerSelect(productDocId) {
        setPickerOpen(false);
        if (pickerCallbackRef.current) {
            pickerCallbackRef.current(productDocId);
            pickerCallbackRef.current = null;
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

    async function handleGroupCreateProduct(groupItems, groupKey) {
        if (groupItems.length === 0) return;
        setBulkBusy(true);
        setError("");
        try {
            const first = groupItems[0];
            const editedName = (groupNames[groupKey] ?? first.name) || first.name;
            const shouldRenameItems = applyNameToItems.has(groupKey);

            setBulkProgress("Creating product...");
            const prodRes = await authApi.post("/products", {
                data: {
                    name: editedName,
                    selling_price: first.selling_price,
                    cost_price: first.cost_price,
                    sku: first.sku,
                    barcode: first.barcode,
                },
            });
            const newProductDocId = prodRes.data?.documentId;
            if (!newProductDocId) throw new Error("Product creation returned no documentId");

            let done = 0;
            for (const item of groupItems) {
                done++;
                setBulkProgress(`Linking item ${done} of ${groupItems.length}...`);
                const updateData = { product: { connect: [newProductDocId] } };
                if (shouldRenameItems) updateData.name = editedName;
                await authApi.put(`/stock-items/${item.documentId}`, { data: updateData });
            }
            setGroupNames(prev => { const next = { ...prev }; delete next[groupKey]; return next; });
            setApplyNameToItems(prev => { const next = new Set(prev); next.delete(groupKey); return next; });
            await loadOrphans();
        } catch (e) {
            console.error("Group create failed:", e);
            setError("Group create & link failed. Some items may have been linked.");
        } finally {
            setBulkBusy(false);
            setBulkProgress("");
        }
    }

    async function handleGroupAttachProduct(groupItems, productDocId) {
        if (!productDocId || groupItems.length === 0) return;
        setBulkBusy(true);
        setError("");
        let done = 0;
        try {
            for (const item of groupItems) {
                done++;
                setBulkProgress(`Attaching item ${done} of ${groupItems.length}...`);
                await authApi.put(`/stock-items/${item.documentId}`, {
                    data: { product: { connect: [productDocId] } },
                });
            }
            await loadOrphans();
        } catch (e) {
            console.error("Group attach failed:", e);
            setError(`Group attach failed at item ${done}. ${done - 1} items were processed.`);
        } finally {
            setBulkBusy(false);
            setBulkProgress("");
        }
    }

    function handleSort(field) {
        if (sortField === field) {
            setSortDir(d => d === "asc" ? "desc" : "asc");
        } else {
            setSortField(field);
            setSortDir("asc");
        }
        setPage(1);
    }

    function sortIndicator(field) {
        if (sortField !== field) return <span className="text-muted ms-1 small">⇅</span>;
        return <span className="ms-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
    }

    function toggleGroup(key) {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    }

    const groupedItems = useMemo(() => {
        const groups = [];
        const map = new Map();
        for (const item of items) {
            const key = (item.name || "").toLowerCase();
            if (!map.has(key)) {
                const group = { name: item.name || "", items: [] };
                map.set(key, group);
                groups.push(group);
            }
            map.get(key).items.push(item);
        }
        if (duplicatesOnly) return groups.filter(g => g.items.length > 1);
        return groups;
    }, [items, duplicatesOnly]);

    const hasActiveFilters = statusFilter || skuFilter || duplicatesOnly;

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
                        style={{ maxWidth: 220 }}
                    />
                    <select
                        className="form-select"
                        value={statusFilter}
                        onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                        style={{ width: 160 }}
                    >
                        <option value="">All Statuses</option>
                        {STATUS_OPTIONS.map(s => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                    <select
                        className="form-select"
                        value={skuFilter}
                        onChange={e => { setSkuFilter(e.target.value); setPage(1); }}
                        style={{ width: 140 }}
                    >
                        <option value="">All SKUs</option>
                        <option value="has">Has SKU</option>
                        <option value="none">No SKU</option>
                    </select>
                    <div className="form-check ms-1">
                        <input
                            type="checkbox"
                            className="form-check-input"
                            id="dupCheck"
                            checked={duplicatesOnly}
                            onChange={e => setDuplicatesOnly(e.target.checked)}
                        />
                        <label className="form-check-label" htmlFor="dupCheck">Duplicates only</label>
                    </div>
                    {hasActiveFilters && (
                        <button
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => { setStatusFilter(""); setSkuFilter(""); setDuplicatesOnly(false); setPage(1); }}
                        >
                            Clear filters
                        </button>
                    )}
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
                        <button
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => openProductPicker(
                                `Attach ${selected.size} selected items to…`,
                                (docId) => handleBulkAttachProduct(docId)
                            )}
                            disabled={bulkBusy}
                        >
                            Attach all to…
                        </button>
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
                                    <th role="button" onClick={() => handleSort("name")}>Name {sortIndicator("name")}</th>
                                    <th role="button" onClick={() => handleSort("sku")}>SKU {sortIndicator("sku")}</th>
                                    <th role="button" onClick={() => handleSort("selling_price")}>Selling Price {sortIndicator("selling_price")}</th>
                                    <th role="button" onClick={() => handleSort("cost_price")}>Cost Price {sortIndicator("cost_price")}</th>
                                    <th role="button" onClick={() => handleSort("status")}>Status {sortIndicator("status")}</th>
                                    <th style={{ minWidth: 280 }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {groupedItems.flatMap(group => {
                                    const groupKey = group.name.toLowerCase();
                                    const isMulti = group.items.length > 1;
                                    const isExpanded = expandedGroups.has(groupKey);
                                    const rows = [];

                                    if (isMulti) {
                                        const editedName = groupNames[groupKey] ?? group.name;
                                        const nameChanged = editedName !== group.name;
                                        rows.push(
                                            <tr key={`grp-${group.name}`} className="table-warning">
                                                <td
                                                    colSpan={2}
                                                    className="fw-bold"
                                                    role="button"
                                                    onClick={() => toggleGroup(groupKey)}
                                                    style={{ cursor: "pointer" }}
                                                >
                                                    <span className="me-2">{isExpanded ? "▼" : "▶"}</span>
                                                    <span className="badge bg-secondary ms-1">{group.items.length} items</span>
                                                    {bulkProgress && <span className="text-muted ms-2 fw-normal small">{bulkProgress}</span>}
                                                </td>
                                                <td colSpan={3}>
                                                    <div className="d-flex align-items-center gap-2">
                                                        <input
                                                            type="text"
                                                            className={`form-control form-control-sm${nameChanged ? " border-primary" : ""}`}
                                                            value={editedName}
                                                            onChange={e => setGroupNames(prev => ({ ...prev, [groupKey]: e.target.value }))}
                                                            onClick={e => e.stopPropagation()}
                                                            disabled={bulkBusy}
                                                            placeholder="Product name"
                                                        />
                                                        {nameChanged && (
                                                            <div className="form-check text-nowrap" onClick={e => e.stopPropagation()}>
                                                                <input
                                                                    type="checkbox"
                                                                    className="form-check-input"
                                                                    id={`apply-${groupKey}`}
                                                                    checked={applyNameToItems.has(groupKey)}
                                                                    onChange={e => setApplyNameToItems(prev => {
                                                                        const next = new Set(prev);
                                                                        if (e.target.checked) next.add(groupKey); else next.delete(groupKey);
                                                                        return next;
                                                                    })}
                                                                    disabled={bulkBusy}
                                                                />
                                                                <label className="form-check-label small" htmlFor={`apply-${groupKey}`}>Rename items</label>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td colSpan={2} className="text-end">
                                                    <button
                                                        className="btn btn-sm btn-outline-primary me-2"
                                                        onClick={() => handleGroupCreateProduct(group.items, groupKey)}
                                                        disabled={bulkBusy}
                                                    >
                                                        {bulkBusy ? "Working..." : "Create Product & Link All"}
                                                    </button>
                                                    <button
                                                        className="btn btn-sm btn-outline-secondary"
                                                        onClick={() => openProductPicker(
                                                            `Attach ${group.items.length} items to…`,
                                                            (docId) => handleGroupAttachProduct(group.items, docId)
                                                        )}
                                                        disabled={bulkBusy}
                                                    >
                                                        Attach all to…
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    }

                                    if (!isMulti || isExpanded) {
                                        group.items.forEach(item => {
                                            const isBusy = busyId === item.documentId;
                                            rows.push(
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
                                                        <button
                                                            className="btn btn-sm btn-outline-secondary"
                                                            onClick={() => openProductPicker(
                                                                `Attach "${item.name}" to…`,
                                                                (docId) => handleAttachProduct(item, docId)
                                                            )}
                                                            disabled={isBusy}
                                                        >
                                                            Attach to…
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        });
                                    }
                                    return rows;
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
                <ProductPickerModal
                    show={pickerOpen}
                    onClose={() => setPickerOpen(false)}
                    onSelect={onPickerSelect}
                    title={pickerTitle}
                />
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
