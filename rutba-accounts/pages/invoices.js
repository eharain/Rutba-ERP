import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";

export default function Invoices() {
    const { jwt } = useAuth();
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!jwt) return;
        authApi.get("/acc-invoices?sort=date:desc", {}, jwt)
            .then((res) => setInvoices(res.data || []))
            .catch((err) => console.error("Failed to load invoices", err))
            .finally(() => setLoading(false));
    }, [jwt]);

    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-3">Invoices</h2>

                {loading && <p>Loading invoices...</p>}

                {!loading && invoices.length === 0 && (
                    <div className="alert alert-info">No invoices found.</div>
                )}

                {!loading && invoices.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover">
                            <thead className="table-dark">
                                <tr>
                                    <th>Invoice #</th>
                                    <th>Date</th>
                                    <th>Customer</th>
                                    <th>Amount</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {invoices.map((inv) => (
                                    <tr key={inv.id}>
                                        <td>{inv.invoice_number || inv.id}</td>
                                        <td>{new Date(inv.date).toLocaleDateString()}</td>
                                        <td>{inv.customer_name || "—"}</td>
                                        <td>{inv.amount != null ? inv.amount.toFixed(2) : "0.00"}</td>
                                        <td>
                                            <span className={`badge bg-${invoiceStatusColor(inv.status)}`}>
                                                {inv.status || "Draft"}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}

function invoiceStatusColor(status) {
    switch (status) {
        case "Paid": return "success";
        case "Sent": return "info";
        case "Overdue": return "danger";
        case "Draft": return "secondary";
        default: return "warning";
    }
}

export async function getServerSideProps() { return { props: {} }; }
