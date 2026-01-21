import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import {
    Table,
    TableHead,
    TableRow,
    TableCell,
    TableBody,
    CircularProgress,
    TablePagination,
} from "../components/Table";
import Layout from "../components/Layout";
import ProtectedRoute from "../components/ProtectedRoute";
import {
    fetchPurchases,
    fetchEnumsValues,
    fetchPurchaseByIdDocumentIdOrPO,
    savePurchase,
} from "../lib/pos";
import { useUtil } from "../context/UtilContext";
export default function PurchasesPage() {
    const [purchases, setPurchases] = useState([]);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
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
                fetchPurchases(page + 1, rowsPerPage),
                fetchEnumsValues("purchase", "status"),
            ]);

            setPurchases(data.data);
            setTotal(data.meta.pagination.total);
            setPurchaseStatuses(statuses || []);

            setLoading(false);
        }
    }, [page, rowsPerPage]);

    const handleChangePage = (_, newPage) => {
        setPage(newPage);
    };

    const handleChangeRowsPerPage = (event) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
    };


    function getStatusAction(purchase) {
        const identifier = purchase.documentId || purchase.id || purchase.orderId;

        if(['Submitted','Partially Received'].includes(purchase.status)){
            return {action:'Receive' ,url:`/${identifier}/receive`,identifier}
        }
        
        if(['Draft','Pending'].includes(purchase.status)){
            return {action:'Edit',url:`/${identifier}/purchase`,identifier};
         }
         if(['Received'].includes(purchase.status)){
            { return {action:'View',url:`/${identifier}/purchase-view`,identifier};}
         }
         
    }
    


    const handleEdit = (purchase) => {
        // Navigate to individual purchase edit page using documentId, id, or orderId
        

        const sa = getStatusAction(purchase)
        if(sa.url)
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
                <div>
                    <h2 style={{ marginBottom: 16 }}>Purchases</h2>

                    {/* Optional: Add New Purchase Button */}
                    <div style={{ marginBottom: 16 }}>
                        <Link href="/new/purchase" passHref>
                            <button
                                style={{
                                    padding: "8px 16px",
                                    background: "#0d1b75",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "4px",
                                    cursor: "pointer"
                                }}
                            >
                                + New Purchase
                            </button>
                        </Link>
                    </div>
            
                    <div>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>Purchase Number</TableCell>
                                    <TableCell>Date</TableCell>
                                    <TableCell>Supplier</TableCell>
                                    <TableCell>Invoice</TableCell>
                                    <TableCell align="right">Total</TableCell>
                                    <TableCell>Status</TableCell>
                                    <TableCell>Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={7} align="center">
                                            <CircularProgress size={24} />
                                        </TableCell>
                                    </TableRow>
                                ) : purchases.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} align="center">
                                            No purchases found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    purchases.map((purchase) => (
                                        <TableRow key={purchase.id}>
                                            <TableCell>
                                                <strong>{purchase.orderId}</strong>
                                            </TableCell>
                                            <TableCell>{purchase.order_date ? new Date(purchase.order_date).toLocaleDateString() : 'N/A'}</TableCell>
                                            <TableCell>{purchase?.suppliers?.map(s => s.name).join(', ')}</TableCell>
                                            <TableCell>{purchase.orderId}</TableCell>
                                            <TableCell align="right">
                                                {currency}{parseFloat(purchase.total || 0).toFixed(2)}
                                            </TableCell>
                                            <TableCell>
                                                <span
                                                    style={{
                                                        padding: "4px 8px",
                                                        borderRadius: "4px",
                                                        backgroundColor: getStatusColor(purchase.status),
                                                        color: "white",
                                                        fontSize: "12px",
                                                        fontWeight: "bold"
                                                    }}
                                                >
                                                    {purchase.status}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <div style={{ display: "flex", gap: "8px" }}>
                                                    <button
                                                        onClick={() => handleEdit(purchase)}
                                                        style={{
                                                            padding: "4px 12px",
                                                            background: "transparent",
                                                            color: "#007bff",
                                                            border: "1px solid #007bff",
                                                            borderRadius: "4px",
                                                            cursor: "pointer",
                                                            fontSize: "12px"
                                                        }}
                                                    >
                                                        {getStatusAction(purchase)?.action}
                                                    </button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                        <TablePagination
                            count={total}
                            page={page}
                            onPageChange={handleChangePage}
                            rowsPerPage={rowsPerPage}
                            onRowsPerPageChange={handleChangeRowsPerPage}
                            rowsPerPageOptions={[5, 10, 25]}
                        />
                    </div>
                </div>
            </Layout>
        </ProtectedRoute>
    );
}