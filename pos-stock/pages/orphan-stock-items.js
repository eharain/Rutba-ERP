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

// Server page size used while draining all orphan items into memory.
const FETCH_PAGE_SIZE = 20000;

/** Lowercase, strip punctuation, split a name into word tokens. */
function tokenize(name) {
    return String(name ?? "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
}

export default function OrphanStockItemsPage() {
    const [allItems, setAllItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [busyId, setBusyId] = useState(null);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState(new Set());
    const [bulkBusy, setBulkBusy] = useState(false);
    const [bulkProgress, setBulkProgress] = useState("");
    const [sortField, setSortField] = useState("name");
    const [sortDir, setSortDir] = useState("asc");
    const [statusFilter, setStatusFilter] = useState("");
    const [skuFilter, setSkuFilter] = useState("");
    const [duplicatesOnly, setDuplicatesOnly] = useState(false);
    const [expandedKeys, setExpandedKeys] = useState(new Set());
    const [groupNames, setGroupNames] = useState({});
    const [applyNameToItems, setApplyNameToItems] = useState(new Set());
    const [pickerOpen, setPickerOpen] = useState(false);
    const [pickerTitle, setPickerTitle] = useState("");
    const pickerCallbackRef = useRef(null);

    useEffect(() => {
        loadOrphans();
    }, []);

    // Drain every orphan stock item into memory; grouping/filtering/sorting are
    // all client-side from here so identical and similar names always meet.
    async function loadOrphans() {
        setLoading(true);
        setError("");
        try {
            let fetched = [];
            let serverPage = 1;
            let total = Infinity;
            while (fetched.length < total) {
                const res = await StockItemsEndpoints.orphanGroupItems({ page: serverPage, pageSize: FETCH_PAGE_SIZE });
                const batch = res.data || [];
                fetched = fetched.concat(batch);
                total = res.meta?.pagination?.total ?? fetched.length;
                if (batch.length === 0) break;
                serverPage++;
            }
            setAllItems(fetched);
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
        setExpandedKeys(prev => {
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
        setExpandedKeys(prev => {
            const next = new Set(prev);
            next.add(groupKey);
            return next;
        });
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

    async function handleGroupCreateProduct(groupItems, groupKey, defaultName) {
        if (groupItems.length === 0) return;
        setBulkBusy(true);
        setError("");
        try {
            const first = groupItems[0];
            const editedName = (groupNames[groupKey] ?? defaultName) || first.name;
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

    function toggleExpanded(key) {
        setExpandedKeys(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    }

    const filteredItems = useMemo(() => {
        const term = search.trim().toLowerCase();
        return allItems.filter(i => {
            if (statusFilter && i.status !== statusFilter) return false;
            if (skuFilter === "has" && !i.sku) return false;
            if (skuFilter === "none" && i.sku) return false;
            if (term) {
                const haystack = `${i.name || ""} ${i.sku || ""} ${i.barcode || ""}`.toLowerCase();
                if (!haystack.includes(term)) return false;
            }
            return true;
        });
    }, [allItems, search, statusFilter, skuFilter]);

    const clusters = useMemo(() => {
        // 1) Exact-name groups — case, punctuation and spacing insensitive, so
        //    "Blue-Lace" and "blue lace" land in the same group.
        const groupMap = new Map();
        for (const item of filteredItems) {
            const tokens = tokenize(item.name);
            const key = tokens.join(" ");
            if (!groupMap.has(key)) {
                groupMap.set(key, { key, name: item.name || "", tokens, tokenSet: new Set(tokens), items: [] });
            }
            groupMap.get(key).items.push(item);
        }
        const groups = Array.from(groupMap.values());

        // 2) Token clustering — union-find over name groups. Two groups join the
        //    same cluster when their word sets overlap enough ("Lace Blue 5mm"
        //    meets "Blue Lace"), regardless of word order or extra punctuation.
        const parent = groups.map((_, i) => i);
        const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
        const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };

        const tokenIndex = new Map();
        groups.forEach((g, i) => {
            for (const t of g.tokenSet) {
                if (!tokenIndex.has(t)) tokenIndex.set(t, []);
                tokenIndex.get(t).push(i);
            }
        });
        groups.forEach((g, i) => {
            if (g.tokenSet.size === 0) return;
            const candidates = new Set();
            for (const t of g.tokenSet) {
                for (const j of tokenIndex.get(t)) if (j > i) candidates.add(j);
            }
            for (const j of candidates) {
                const other = groups[j];
                let inter = 0;
                for (const t of g.tokenSet) if (other.tokenSet.has(t)) inter++;
                const minSize = Math.min(g.tokenSet.size, other.tokenSet.size);
                const isSubset = inter === minSize && minSize >= 2;
                const jaccard = inter / (g.tokenSet.size + other.tokenSet.size - inter);
                if (isSubset || jaccard >= 0.6) union(i, j);
            }
        });

        const clusterMap = new Map();
        groups.forEach((g, i) => {
            const root = find(i);
            if (!clusterMap.has(root)) clusterMap.set(root, []);
            clusterMap.get(root).push(g);
        });

        // 3) Sorting — items within groups, then clusters by their lead item.
        const dir = sortDir === "desc" ? -1 : 1;
        const sortVal = (item) => {
            const v = item?.[sortField];
            if (sortField === "selling_price" || sortField === "cost_price") {
                return v == null ? null : Number(v);
            }
            return v == null ? null : String(v).toLowerCase();
        };
        const cmpItems = (a, b) => {
            const va = sortVal(a), vb = sortVal(b);
            if (va == null && vb == null) return 0;
            if (va == null) return 1;
            if (vb == null) return -1;
            if (va < vb) return -1 * dir;
            if (va > vb) return 1 * dir;
            return 0;
        };

        let clusterList = Array.from(clusterMap.values()).map(gs => {
            gs.sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
            for (const g of gs) g.items.sort(cmpItems);
            const totalCount = gs.reduce((n, g) => n + g.items.length, 0);
            let shared = null;
            for (const g of gs) {
                if (shared === null) shared = new Set(g.tokenSet);
                else for (const t of [...shared]) if (!g.tokenSet.has(t)) shared.delete(t);
            }
            return {
                key: "cluster:" + gs.map(g => g.key).sort().join("|"),
                groups: gs,
                totalCount,
                sharedTokens: [...(shared || [])],
                name: gs[0].name,
            };
        });

        clusterList.sort((a, b) => cmpItems(a.groups[0].items[0], b.groups[0].items[0]));

        if (duplicatesOnly) clusterList = clusterList.filter(c => c.totalCount > 1);
        return clusterList;
    }, [filteredItems, duplicatesOnly, sortField, sortDir]);

    const totalClusters = clusters.length;
    const totalPages = Math.ceil(totalClusters / pageSize) || 1;
    const safePage = Math.min(page, totalPages);

    const pagedClusters = useMemo(
        () => clusters.slice((safePage - 1) * pageSize, safePage * pageSize),
        [clusters, safePage, pageSize]
    );

    const allVisibleItems = useMemo(
        () => pagedClusters.flatMap(c => c.groups.flatMap(g => g.items)),
        [pagedClusters]
    );

    const hasActiveFilters = statusFilter || skuFilter || duplicatesOnly;

    const filters = [
        <input
            key="search"
            type="text"
            className="form-control form-control-sm"
            placeholder="Search by name, SKU or barcode..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
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
                onChange={e => { setDuplicatesOnly(e.target.checked); setPage(1); }}
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
        <button
            key="reload"
            className="btn btn-sm btn-outline-secondary"
            onClick={loadOrphans}
            disabled={loading || bulkBusy}
        >
            ⟳ Reload
        </button>,
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

    // Header row for a set of items sharing an editable target-product name.
    // Used for both exact-name groups and multi-name token clusters.
    function renderGroupHeader({ key, items, count, label, badges, defaultName, rowClass }) {
        const isExpanded = expandedKeys.has(key);
        const editedName = groupNames[key] ?? defaultName;
        const nameChanged = editedName !== defaultName;
        const allGroupSelected = items.length > 0 && items.every(i => selected.has(i.documentId));
        return (
            <tr key={`grp-${key}`} className={rowClass}>
                <td
                    colSpan={2}
                    className="fw-bold"
                    role="button"
                    onClick={() => toggleExpanded(key)}
                    style={{ cursor: "pointer" }}
                >
                    <div className="d-flex align-items-center flex-wrap gap-1">
                        <span className="me-1">{isExpanded ? "▼" : "▶"}</span>
                        <span className="badge bg-secondary">{count} items</span>
                        {badges}
                        {label && <span className="fw-normal small text-muted">{label}</span>}
                        <button
                            className="btn btn-sm btn-outline-secondary py-0 px-1"
                            onClick={e => { e.stopPropagation(); allGroupSelected ? deselectGroupAll(items) : selectGroupAll(items, key); }}
                            disabled={bulkBusy}
                            title={allGroupSelected ? "Deselect all items in this group" : "Select all items in this group"}
                        >
                            {allGroupSelected ? "☐ Deselect" : "☑ Select all"}
                        </button>
                        <button
                            className="btn btn-sm btn-outline-secondary py-0 px-1"
                            onClick={e => { e.stopPropagation(); invertGroupSelection(items, key); }}
                            disabled={bulkBusy}
                            title="Invert selection in this group"
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
                            onChange={e => setGroupNames(prev => ({ ...prev, [key]: e.target.value }))}
                            onClick={e => e.stopPropagation()}
                            disabled={bulkBusy}
                            placeholder="Product name"
                        />
                        {nameChanged && (
                            <div className="form-check text-nowrap" onClick={e => e.stopPropagation()}>
                                <input
                                    type="checkbox"
                                    className="form-check-input"
                                    id={`apply-${key}`}
                                    checked={applyNameToItems.has(key)}
                                    onChange={e => setApplyNameToItems(prev => {
                                        const next = new Set(prev);
                                        if (e.target.checked) next.add(key); else next.delete(key);
                                        return next;
                                    })}
                                    disabled={bulkBusy}
                                />
                                <label className="form-check-label small" htmlFor={`apply-${key}`}>Rename items</label>
                            </div>
                        )}
                    </div>
                </td>
                <td colSpan={2} className="text-end">
                    <button
                        className="btn btn-sm btn-outline-primary me-2"
                        onClick={() => handleGroupCreateProduct(items, key, defaultName)}
                        disabled={bulkBusy}
                    >
                        {bulkBusy ? "Working..." : "Create Product & Link All"}
                    </button>
                    <button
                        className="btn btn-sm btn-outline-secondary"
                        onClick={() => openProductPicker(
                            `Attach ${items.length} items to…`,
                            (docId) => handleGroupAttachProduct(items, docId)
                        )}
                        disabled={bulkBusy}
                    >
                        Attach all to…
                    </button>
                </td>
            </tr>
        );
    }

    function renderItemRow(item, { grouped, indent } = {}) {
        const isBusy = busyId === item.documentId;
        const isSelected = selected.has(item.documentId);
        return (
            <tr
                key={item.documentId}
                className={isSelected ? "table-active" : ""}
                style={grouped ? {
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
                <td style={indent ? { paddingLeft: "2rem" } : undefined}>
                    {item.name || <span className="text-muted fst-italic">No name</span>}
                </td>
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
    }

    return (
        <ProtectedRoute>
            <Layout>
                <ListPageLayout
                    title="Orphan Stock Items"
                    subtitle={`Stock items not linked to any product${allItems.length ? ` · ${filteredItems.length} items in ${totalClusters} groups` : ''}`}
                    filters={filters}
                    bulkActions={bulkActions}
                    selectedCount={selected.size}
                    loading={loading}
                    pagination={
                        <ListPagination
                            page={safePage}
                            pageSize={pageSize}
                            total={totalClusters}
                            onPage={setPage}
                            onPageSize={(n) => { setPageSize(n); setPage(1); }}
                        />
                    }
                    emptyState={
                        <div className="alert alert-success mb-0">All stock items are linked to a product.</div>
                    }
                >
                    {error && <div className="alert alert-danger m-3 mb-0">{error}</div>}
                    {pagedClusters.length === 0 ? null : (
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
                                {pagedClusters.flatMap(cluster => {
                                    const rows = [];
                                    const isMultiGroup = cluster.groups.length > 1;

                                    if (!isMultiGroup) {
                                        // Single name — same behavior as before: plain row
                                        // for singletons, one collapsible header otherwise.
                                        const group = cluster.groups[0];
                                        if (group.items.length === 1) {
                                            rows.push(renderItemRow(group.items[0]));
                                        } else {
                                            rows.push(renderGroupHeader({
                                                key: group.key,
                                                items: group.items,
                                                count: group.items.length,
                                                defaultName: group.name,
                                                rowClass: "table-warning",
                                            }));
                                            if (expandedKeys.has(group.key)) {
                                                for (const item of group.items) rows.push(renderItemRow(item, { grouped: true }));
                                            }
                                        }
                                        return rows;
                                    }

                                    // Token cluster: several distinct names whose words match.
                                    rows.push(renderGroupHeader({
                                        key: cluster.key,
                                        items: cluster.groups.flatMap(g => g.items),
                                        count: cluster.totalCount,
                                        defaultName: cluster.name,
                                        rowClass: "table-info",
                                        badges: <span className="badge bg-info text-dark">{cluster.groups.length} name variants</span>,
                                        label: cluster.sharedTokens.length
                                            ? `matched words: ${cluster.sharedTokens.join(" ")}`
                                            : null,
                                    }));

                                    if (expandedKeys.has(cluster.key)) {
                                        for (const group of cluster.groups) {
                                            if (group.items.length > 1) {
                                                rows.push(renderGroupHeader({
                                                    key: group.key,
                                                    items: group.items,
                                                    count: group.items.length,
                                                    defaultName: group.name,
                                                    rowClass: "table-warning",
                                                }));
                                                if (expandedKeys.has(group.key)) {
                                                    for (const item of group.items) rows.push(renderItemRow(item, { grouped: true, indent: true }));
                                                }
                                            } else {
                                                rows.push(renderItemRow(group.items[0], { grouped: true, indent: true }));
                                            }
                                        }
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
        case "Damaged":
        case "Lost":
        case "Expired": return "danger";
        case "Returned":
        case "ReturnedDamaged":
        case "ReturnedToSupplier": return "primary";
        default: return "light";
    }
}
