import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";

import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import {
    fetchPurchases,
    fetchEnumsValues,
} from "@rutba/api-provider/pos";
import { SuppliersEndpoints } from "@rutba/api-provider/endpoints";
import { useUtil } from "@rutba/pos-shared/context/UtilContext";
import { PermissionCheck } from "@rutba/pos-shared/components/PermissionCheck";
import { SortableTh } from "@rutba/pos-shared/components/Table";
import { ProductFilter } from "@rutba/pos-shared/components/filter/product-filter";
import ListPageLayout, { AddButton } from "@rutba/pos-shared/components/ListPageLayout";
import ListPagination from "@rutba/pos-shared/components/ListPagination";

export default function PurchasesPage() {
    const [purchases, setPurchases] = useState([]);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [purchaseStatuses, setPurchaseStatuses] = useState([]);
    const [suppliers, setSuppliers] = useState([]);

    // Sorting — default to newest first (matches the previous createdAt:desc order).
    const [sortField, setSortField] = useState("createdAt");
    const [sortOrder, setSortOrder] = useState("desc");

    // Filter inputs.
    const [searchPO, setSearchPO] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [selectedSupplier, setSelectedSupplier] = useState("");
    const [dateRange, setDateRange] = useState({ from: "", to: "" });
    const [totalRange, setTotalRange] = useState({ min: "", max: "" });

    // Derived Strapi filter object + init gate (URL is the source of truth on load).
    const [filters, setFilters] = useState(undefined);
    const [filtersInitialized, setFiltersInitialized] = useState(false);

    const { currency } = useUtil();
    const router = useRouter();

    const sortString = `${sortField}:${sortOrder}`;

    const handleSort = useCallback((field) => {
        if (sortField === field) {
            setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
        } else {
            setSortField(field);
            setSortOrder("asc");
        }
        setPage(1);
    }, [sortField]);

    // Load lookups once (status enum for the filter, suppliers for the dropdown).
    useEffect(() => {
        (async () => {
            const [statuses, supRes] = await Promise.all([
                fetchEnumsValues("purchase", "status"),
                SuppliersEndpoints.list({ pageSize: 200 }),
            ]);
            setPurchaseStatuses(statuses || []);
            setSuppliers(supRes?.data || []);
        })();
    }, []);

    // Hydrate filters from the URL once the router is ready (shareable/back-button state).
    useEffect(() => {
        if (!router.isReady || filtersInitialized) return;

        const gv = (v) => (Array.isArray(v) ? v[0] : v);
        const q = router.query;
        if (q.q) setSearchPO(gv(q.q));
        if (q.status) setStatusFilter(gv(q.status));
        if (q.supplier) setSelectedSupplier(gv(q.supplier));
        if (q.from || q.to) setDateRange({ from: gv(q.from) || "", to: gv(q.to) || "" });
        if (q.totalMin || q.totalMax) setTotalRange({ min: gv(q.totalMin) || "", max: gv(q.totalMax) || "" });

        setFiltersInitialized(true);
    }, [router.isReady, router.query, filtersInitialized]);

    // Rebuild the Strapi filter object + URL whenever a filter input changes.
    useEffect(() => {
        if (!filtersInitialized) return;

        const f = {};
        if (searchPO && searchPO.trim()) f.orderId = { $containsi: searchPO.trim() };
        if (statusFilter) f.status = { $eq: statusFilter };
        if (selectedSupplier) f.suppliers = { documentId: { $eq: selectedSupplier } };
        if (dateRange.from || dateRange.to) {
            f.order_date = {};
            if (dateRange.from) f.order_date.$gte = dateRange.from;
            if (dateRange.to) f.order_date.$lte = `${dateRange.to}T23:59:59.999Z`;
        }
        if (totalRange.min !== "" || totalRange.max !== "") {
            f.total = {};
            if (totalRange.min !== "") f.total.$gte = Number(totalRange.min);
            if (totalRange.max !== "") f.total.$lte = Number(totalRange.max);
        }

        const query = {};
        if (searchPO) query.q = searchPO;
        if (statusFilter) query.status = statusFilter;
        if (selectedSupplier) query.supplier = selectedSupplier;
        if (dateRange.from) query.from = dateRange.from;
        if (dateRange.to) query.to = dateRange.to;
        if (totalRange.min) query.totalMin = totalRange.min;
        if (totalRange.max) query.totalMax = totalRange.max;
        router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });

        setFilters(Object.keys(f).length ? f : undefined);
        setPage(1);
    }, [searchPO, statusFilter, selectedSupplier, dateRange, totalRange, filtersInitialized]);

    // Fetch purchases whenever paging, sorting, or filters change.
    useEffect(() => {
        if (!filtersInitialized) return;
        (async () => {
            setLoading(true);
            const data = await fetchPurchases(page, pageSize, { sort: [sortString], filters });
            setPurchases(data.data);
            setTotal(data.meta.pagination.total);
            setLoading(false);
        })();
    }, [page, pageSize, sortString, filters, filtersInitialized]);

    function getStatusAction(purchase) {
        const identifier = purchase.documentId || purchase.id || purchase.orderId;

        if (['Submitted', 'Partially Received'].includes(purchase.status)) {
            return { action: 'Receive', url: `/${identifier}/purchase-receive`, identifier };
        }
        if (['Draft', 'Pending'].includes(purchase.status)) {
            return { action: 'Edit', url: `/${identifier}/purchase`, identifier };
        }
        if (['Received'].includes(purchase.status)) {
            return { action: 'View', url: `/${identifier}/purchase-view`, identifier };
        }
    }

    const handleEdit = (purchase) => {
        const sa = getStatusAction(purchase);
        if (sa?.url) router.push(sa.url);
    };

    const getStatusColor = (status) => {
        switch (status) {
            case "Pending":
                return "#f5c542";
            case "Submitted":
                return "#42a5f5";
            case "Received":
                return "#66bb6a";
            case "Cancelled":
                return "#ef5350";
            default:
                return "#9e9e9e";
        }
    };

    return (
        <ProtectedRoute>
            <Layout>
                <PermissionCheck required="stock">
                    <ListPageLayout
                        title="Purchases"
                        subtitle={total != null ? `${total} total` : undefined}
                        headerActions={<AddButton label="New Purchase" href="/new/purchase" />}
                        filters={
                            <ProductFilter
                                suppliers={suppliers}
                                selectedSupplier={selectedSupplier}
                                onSupplierChange={setSelectedSupplier}
                                searchText={searchPO}
                                onSearchTextChange={setSearchPO}
                                searchPlaceholder="Search by PO number…"
                                hide={new Set(["brand", "category", "term", "purchase"])}
                                extra={[
                                    {
                                        key: "status",
                                        type: "select",
                                        label: "Status",
                                        value: statusFilter,
                                        onChange: setStatusFilter,
                                        placeholder: "All statuses",
                                        options: (purchaseStatuses || []).map((s) => ({ value: s, label: s })),
                                    },
                                    {
                                        key: "orderDate",
                                        type: "date-range",
                                        label: "Order date",
                                        value: dateRange,
                                        onChange: setDateRange,
                                    },
                                    {
                                        key: "total",
                                        type: "number-range",
                                        label: "Total",
                                        value: totalRange,
                                        onChange: setTotalRange,
                                    },
                                ]}
                            />
                        }
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
                        emptyState={<div>No purchases found.</div>}
                    >
                        <div className="table-responsive">
                            <table className="table table-hover list-table">
                                <thead>
                                    <tr>
                                        <SortableTh label="Purchase Number" field="orderId" sortField={sortField} sortDir={sortOrder} onSort={handleSort} />
                                        <SortableTh label="Date" field="order_date" sortField={sortField} sortDir={sortOrder} onSort={handleSort} />
                                        <th>Supplier</th>
                                        <th>Invoice</th>
                                        <SortableTh label="Total" field="total" sortField={sortField} sortDir={sortOrder} onSort={handleSort} align="right" />
                                        <SortableTh label="Status" field="status" sortField={sortField} sortDir={sortOrder} onSort={handleSort} />
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {purchases.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="text-center text-muted py-4">
                                                No purchases found.
                                            </td>
                                        </tr>
                                    ) : (
                                        purchases.map((purchase) => (
                                            <tr key={purchase.id}>
                                                <td><strong>{purchase.orderId}</strong></td>
                                                <td>{purchase.order_date ? new Date(purchase.order_date).toLocaleDateString() : 'N/A'}</td>
                                                <td>{purchase?.suppliers?.map(s => s.name).join(', ')}</td>
                                                <td>{purchase.orderId}</td>
                                                <td className="text-end">
                                                    {currency}{parseFloat(purchase.total || 0).toFixed(2)}
                                                </td>
                                                <td>
                                                    <span
                                                        className="list-status"
                                                        style={{ backgroundColor: getStatusColor(purchase.status), color: "white" }}
                                                    >
                                                        {purchase.status}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div className="list-actions">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleEdit(purchase)}
                                                            className="btn btn-sm btn-outline-primary"
                                                        >
                                                            {getStatusAction(purchase)?.action}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => window.open(`/print-purchase?documentId=${purchase.documentId || purchase.id || purchase.orderId}`, '_blank', 'width=920,height=1040')}
                                                            className="btn btn-sm btn-outline-secondary"
                                                            title="Print purchase order"
                                                        >
                                                            <i className="fas fa-print"></i>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </ListPageLayout>
                </PermissionCheck>
            </Layout>
        </ProtectedRoute>
    );
}
