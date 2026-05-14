import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import {
    fetchPurchases,
    fetchEnumsValues,
    fetchPurchaseByIdDocumentIdOrPO,
    savePurchase,
} from "@rutba/api-provider/pos";
import { useUtil } from "@rutba/pos-shared/context/UtilContext";
import { PermissionCheck } from "@rutba/pos-shared/components/PermissionCheck";
import ListPageLayout, { AddButton } from "@rutba/pos-shared/components/ListPageLayout";
import ListPagination from "@rutba/pos-shared/components/ListPagination";

export default function PurchasesPage() {
    const [purchases, setPurchases] = useState([]);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [purchaseStatuses, setPurchaseStatuses] = useState([]);
    const {currency} = useUtil();
    const router = useRouter();


    useEffect(() => {
        loadData();
        async function loadData() {
            setLoading(true);

            const [data, statuses] = await Promise.all([
                fetchPurchases(page, pageSize),
                fetchEnumsValues("purchase", "status"),
            ]);

            setPurchases(data.data);
            setTotal(data.meta.pagination.total);
            setPurchaseStatuses(statuses || []);

            setLoading(false);
        }
    }, [page, pageSize]);


    function getStatusAction(purchase) {
        const identifier = purchase.documentId || purchase.id || purchase.orderId;

        if(['Submitted','Partially Received'].includes(purchase.status)){
            return { action: 'Receive', url: `/${identifier}/purchase-receive`,identifier}
        }

        if(['Draft','Pending'].includes(purchase.status)){
            return {action:'Edit',url:`/${identifier}/purchase`,identifier};
         }
         if(['Received'].includes(purchase.status)){
            { return {action:'View',url:`/${identifier}/purchase-view`,identifier};}
         }

    }



    const handleEdit = (purchase) => {
        const sa = getStatusAction(purchase)
        if(sa?.url)
        router.push(sa.url);
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
                                        <th>Purchase Number</th>
                                        <th>Date</th>
                                        <th>Supplier</th>
                                        <th>Invoice</th>
                                        <th className="text-end">Total</th>
                                        <th>Status</th>
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
