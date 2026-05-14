import { useEffect, useState, useRef, useMemo } from "react";
import Layout from "../components/Layout";
import ProductPickerModal from "../components/ProductPickerModal";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { StockItemsEndpoints, ProductsEndpoints } from "@rutba/api-provider/endpoints/index.js";
import ListPageLayout from "@rutba/pos-shared/components/ListPageLayout";
import ListPagination from "@rutba/pos-shared/components/ListPagination";

const STATUS_OPTIONS = [
    "InStock", "Sold", "Received", "Reserved",
    "Returned", "ReturnedDamaged", "ReturnedToSupplier",
    "Damaged", "Lost", "Expired", "Reduced",
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
    const [groupExtras, setGroupExtras] = useState({});
    const [groupLoading, setGroupLoading] = useState({});
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
        setGroupExtras({});
        try {
            const res = await StockItemsEndpoints.orphanGroups({ page, pageSize, search, statusFilter, skuFilter, sortField, sortDir });
            const groups = res.data || [];
            const sampleItems = groups
                .map(g => ({
                    ...(g.sample || {}),
                    __groupName: g.name,
                    __groupSellingPrice: g.selling_price,
                    __groupCount: g.count || 0,
                }))
                .filter(i => i.documentId);
            setItems(sampleItems);
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
            const prodRes = await ProductsEndpoints.create({
                name: item.name,
                selling_price: item.selling_price,
                cost_price: item.cost_price,
                sku: item.sku,
                barcode: item.barcode,
            });
            const newProductDocId = (prodRes?.data ?? prodRes)?.documentId;
            if (newProductDocId) {
                await StockItemsEndpoints.update(item.documentId, { product: { connect: [newProductDocId] } });
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
            await StockItemsEndpoints.update(item.documentId, { product: { connect: [productDocId] } });
            await loadOrphans();
        } catch (e) {
            console.error("Failed to attach product:", e);
            setError("Failed to attach product.");
        } finally {
            setBusyId(null);
        }
    }

    function selectGroupAll(groupItems, groupKey) {
        setSelected(prev => {
            const next = new Set(prev);
            for (const item of groupItems) next.add(item.documentId);
            return next;
        });
        setExpandedGroups(prev => {
            const next = new Set(prev);
            next.add(groupKey);
            return next;
        });
    }

    function deselectGroupAll(groupItems) {
        setSelected(prev => {
            const next = new Set(prev);
            for (const item of groupItems) next.delete(item.documentId);
            return next;
        });
    }

    function invertGroupSelection(groupItems, groupKey) {
        setSelected(prev => {
            const next = new Set(prev);
            for (const item of groupItems) {
                if (next.has(item.documentId)) next.delete(item.documentId);
                else next.add(item.documentId);
            }
            return next;
        });
        setExpandedGroups(prev => {
            const next = new Set(prev);
            next.add(groupKey);
            return next;
        });
    }

    function makeGroupKey(name, sellingPrice) {
        const normalizedName = String(name ?? "").toLowerCase();
        const normalizedSellingPrice = sellingPrice == null ? "__null__" : String(sellingPrice);
        return `${normalizedName}__${normalizedSellingPrice}`;
    }

    async function loadAllInGroup(group) {
        const groupKey = group.key;
        setGroupLoading(prev => ({ ...prev, [groupKey]: true }));
        try {
            const res = await StockItemsEndpoints.orphanGroupItems({ page: 1, pageSize: 10000, name: group.name, selling_price: group.selling_price == null ? "__null__" : String(group.selling_price), statusFilter, skuFilter, sortField, sortDir });
            const exactGroupItems = (res.data || []).filter(item =>
                makeGroupKey(item.name, item.selling_price) === groupKey
            );
            setGroupExtras(prev => ({ ...prev, [groupKey]: exactGroupItems }));
            setExpandedGroups(prev => {
                const next = new Set(prev);
                next.add(groupKey);
                return next;
            });
        } catch (e) {
            console.error("Failed to load all items for group:", e);
            setError("Failed to load all items for this group.");
        } finally {
            setGroupLoading(prev => ({ ...prev, [groupKey]: false }));
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
        const all = allVisibleItems;
        if (selected.size === all.length) {
            setSelected(new Set());
        } else {
            setSelected(new Set(all.map(i => i.documentId)));
        }
    }

    async function handleBulkCreateProducts() {
        const selectedItems = allVisibleItems.filter(i => selected.has(i.documentId));
        if (selectedItems.length === 0) return;
        setBulkBusy(true);
        setError("");
        try {
            const first = selectedItems[0];
            setBulkProgress("Creating product...");
            const prodRes = await ProductsEndpoints.create({
                name: first.name,
                selling_price: first.selling_price,
                cost_price: first.cost_price,
                sku: first.sku,
                barcode: first.barcode,
            });
            const newProductDocId = (prodRes?.data ?? prodRes)?.documentId;
            if (!newProductDocId) throw new Error("Product creation returned no documentId");

            let done = 0;
            for (const item of selectedItems) {
                done++;
                setBulkProgress(`Linking item ${done} of ${selectedItems.length}...`);
                await StockItemsEndpoints.update(item.documentId, { product: { connect: [newProductDocId] } });
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
        const selectedItems = allVisibleItems.filter(i => selected.has(i.documentId));
        if (selectedItems.length === 0) return;
        setBulkBusy(true);
        setError("");
        let done = 0;
        try {
            for (const item of selectedItems) {
                done++;
                setBulkProgress(`Attaching item ${done} of ${selectedItems.length}...`);
                await StockItemsEndpoints.update(item.documentId, { product: { connect: [productDocId] } });
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
            const prodRes = await ProductsEndpoints.create({
                    name: editedName,
                    selling_price: first.selling_price,
                    cost_price: first.cost_price,
                    sku: first.sku,
                    barcode: first.barcode,
                });
            const newProductDocId = (prodRes?.data ?? prodRes)?.documentId;
            if (!newProductDocId) throw new Error("Product creation returned no documentId");

            let done = 0;
            for (const item of groupItems) {
                done++;
                setBulkProgress(`Linking item ${done} of ${groupItems.length}...`);
                const updateData = { product: { connect: [newProductDocId] } };
                if (shouldRenameItems) updateData.name = editedName;
                await StockItemsEndpoints.update(item.documentId, updateData);
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
                await StockItemsEndpoints.update(item.documentId, { product: { connect: [productDocId] } });
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
            const groupName = item.__groupName ?? item.name;
            const groupSellingPrice = item.__groupSellingPrice ?? item.selling_price;
            const key = makeGroupKey(groupName, groupSellingPrice);
            if (!map.has(key)) {
                const group = {
                    key,
                    name: groupName || "",
                    selling_price: groupSellingPrice,
                    groupCount: item.__groupCount || 0,
                    items: [],
                };
                map.set(key, group);
                groups.push(group);
            }
            map.get(key).items.push(item);
            if (!map.get(key).groupCount) map.get(key).groupCount = map.get(key).items.length;
        }
        for (const [extraKey, extraItems] of Object.entries(groupExtras)) {
            if (extraItems.length === 0) continue;
            if (map.has(extraKey)) {
                map.get(extraKey).items = extraItems;
                map.get(extraKey).groupCount = Math.max(map.get(extraKey).groupCount || 0, extraItems.length);
            } else {
                const first = extraItems[0] || {};
                const group = {
                    key: extraKey,
                    name: first.name || "",
                    selling_price: first.selling_price,
                    groupCount: extraItems.length,
                    items: [...extraItems],
                };
                map.set(extraKey, group);
                groups.push(group);
            }
        }
        if (duplicatesOnly) return groups.filter(g => (g.groupCount || g.items.length) > 1);
        return groups;
    }, [items, duplicatesOnly, groupExtras]);

    const allVisibleItems = useMemo(() => groupedItems.flatMap(g => g.items), [groupedItems]);

    const hasActiveFilters = statusFilter || skuFilter || duplicatesOnly;

    const totalPages = Math.ceil(total / pageSize) || 1;

    const filters = [
        <input
            key="search"
            type="text"
            className="form-control form-control-sm"
            placeholder="Search by name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
        />,
        <select
            key="status"
            className="form-select form-select-sm"
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
        >
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{s}</option>
            ))}
        </select>,
        <select
            key="sku"
            className="form-select form-select-sm"
            value={skuFilter}
            onChange={e => { setSkuFilter(e.target.value); setPage(1); }}
        >
            <option value="">All SKUs</option>
            <option value="has">Has SKU</option>
            <option value="none">No SKU</option>
        </select>,
        <div key="dup" className="form-check">
            <input
                type="checkbox"
                className="form-check-input"
                id="dupCheck"
                checked={duplicatesOnly}
                onChange={e => setDuplicatesOnly(e.target.checked)}
            />
            <label className="form-check-label" htmlFor="dupCheck">Duplicates only</label>
        </div>,
        hasActiveFilters && (
            <button
                key="clear"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => { setStatusFilter(""); setSkuFilter(""); setDuplicatesOnly(false); setPage(1); }}
            >
                Clear filters
            </button>
        ),
    ].filter(Boolean);

    const bulkActions = (
        <>
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
        </>
    );

    return (
        <ProtectedRoute>
            <Layout>
                <ListPageLayout
                    title="Orphan Stock Items"
                    subtitle={`Stock items not linked to any product${total ? ` · ${total} total` : ''}`}
                    filters={filters}
                    bulkActions={bulkActions}
                    selectedCount={selected.size}
                    loading={loading}
                    pagination={
                        <ListPagination
                            page={page}
                            pageSize={pageSize}
                            total={total}
                            onPage={setPage}
                            onPageSize={(n) => { setPageSize(n); setPage(1); }}
                        />
                    }
                    emptyState={
                        <div className="alert alert-success mb-0">All stock items are linked to a product.</div>
                    }
                >
                    {error && <div className="alert alert-danger m-3 mb-0">{error}</div>}
                    {items.length === 0 ? null : (
                    <div className="table-responsive">
                        <table className="table table-hover list-table">
                            <thead className="table-light">
                                <tr>
                                    <th style={{ width: 40 }}>
                                        <input
                                            type="checkbox"
                                            className="form-check-input"
                                            checked={allVisibleItems.length > 0 && selected.size === allVisibleItems.length}
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
                                    const groupKey = group.key;
                                    const groupCount = group.groupCount || group.items.length;
                                    const isMulti = groupCount > 1;
                                    const isExpanded = expandedGroups.has(groupKey);
                                    const rows = [];

                                    if (isMulti) {
                                        const editedName = groupNames[groupKey] ?? group.name;
                                        const nameChanged = editedName !== group.name;
                                        const allGroupSelected = group.items.every(i => selected.has(i.documentId));
                                        const hasExtras = !!groupExtras[groupKey];
                                        const isGroupLoading = !!groupLoading[groupKey];
                                        const groupFullyLoaded = hasExtras || group.items.length >= groupCount;
                                        rows.push(
                                            <tr key={`grp-${groupKey}`} className="table-warning">
                                                <td
                                                    colSpan={2}
                                                    className="fw-bold"
                                                    role="button"
                                                    onClick={() => toggleGroup(groupKey)}
                                                    style={{ cursor: "pointer" }}
                                                >
                                                    <div className="d-flex align-items-center flex-wrap gap-1">
                                                        <span className="me-1">{isExpanded ? "▼" : "▶"}</span>
                                                        <span className="badge bg-secondary">{groupCount} items</span>
                                                        {groupCount > group.items.length && !hasExtras && (
                                                            <button
                                                                className="btn btn-sm btn-outline-info py-0 px-1"
                                                                onClick={e => { e.stopPropagation(); loadAllInGroup(group); }}
                                                                disabled={bulkBusy || isGroupLoading}
                                                            >
                                                                {isGroupLoading ? "Loading…" : "Load all"}
                                                            </button>
                                                        )}
                                                        {hasExtras && <span className="badge bg-info">All loaded</span>}
                                                        <button
                                                            className="btn btn-sm btn-outline-secondary py-0 px-1"
                                                            onClick={e => { e.stopPropagation(); allGroupSelected ? deselectGroupAll(group.items) : selectGroupAll(group.items, groupKey); }}
                                                            disabled={bulkBusy || !groupFullyLoaded}
                                                            title={groupFullyLoaded ? (allGroupSelected ? "Deselect all items in this group" : "Select all items in this group") : "Load all items first"}
                                                        >
                                                            {allGroupSelected ? "☐ Deselect" : "☑ Select all"}
                                                        </button>
                                                        <button
                                                            className="btn btn-sm btn-outline-secondary py-0 px-1"
                                                            onClick={e => { e.stopPropagation(); invertGroupSelection(group.items, groupKey); }}
                                                            disabled={bulkBusy || !groupFullyLoaded}
                                                            title={groupFullyLoaded ? "Invert selection in this group" : "Load all items first"}
                                                        >
                                                            ⇄ Invert
                                                        </button>
                                                        {bulkProgress && <span className="text-muted fw-normal small">{bulkProgress}</span>}
                                                    </div>
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
                                                        disabled={bulkBusy || !groupFullyLoaded}
                                                        title={groupFullyLoaded ? "" : "Load all items first"}
                                                    >
                                                        {bulkBusy ? "Working..." : "Create Product & Link All"}
                                                    </button>
                                                    <button
                                                        className="btn btn-sm btn-outline-secondary"
                                                        onClick={() => openProductPicker(
                                                            `Attach ${group.items.length} items to…`,
                                                            (docId) => handleGroupAttachProduct(group.items, docId)
                                                        )}
                                                        disabled={bulkBusy || !groupFullyLoaded}
                                                        title={groupFullyLoaded ? "" : "Load all items first"}
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
                                            const isSelected = selected.has(item.documentId);
                                            rows.push(
                                                <tr
                                                    key={item.documentId}
                                                    className={isSelected ? "table-active" : ""}
                                                    style={isMulti ? {
                                                        backgroundColor: isSelected ? undefined : "#fdf2d0",
                                                        borderLeft: "4px solid #f0ad4e",
                                                    } : undefined}
                                                >
                                                    <td>
                                                        <input
                                                            type="checkbox"
                                                            className="form-check-input"
                                                            checked={isSelected}
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
                    </div>
                    )}
                </ListPageLayout>
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


