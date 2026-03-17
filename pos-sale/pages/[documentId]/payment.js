import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { authApi } from "@rutba/pos-shared/lib/api";
import { useUtil } from "@rutba/pos-shared/context/UtilContext";

export default function PaymentRedirectPage() {
    const router = useRouter();
    const { documentId } = router.query;
    const { currency } = useUtil();
    const [payment, setPayment] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!documentId) return;
        loadPayment();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [documentId]);

    async function loadPayment() {
        setLoading(true);
        setError("");
        try {
            const res = await authApi.get(`/payments/${documentId}`, {
                populate: {
                    sale: { fields: ["documentId", "invoice_no", "total", "payment_status", "status"] },
                    sale_return: { fields: ["documentId", "return_no", "total_refund", "type", "refund_status"] },
                    cash_register: { fields: ["documentId", "id", "status", "desk_name", "branch_name"] }
                }
            });
            const data = res?.data ?? res;
            if (!data) {
                setError("Payment not found.");
            } else {
                setPayment(data);
            }
        } catch (err) {
            console.error("Failed to load payment", err);
            setError("Failed to load payment.");
        } finally {
            setLoading(false);
        }
    }

    const fmt = (v) => `${currency}${Number(v || 0).toFixed(2)}`;
    const amt = Number(payment?.amount || 0);
    const isRefund = amt < 0;

    const saleDocId = payment?.sale?.documentId;
    const returnDocId = payment?.sale_return?.documentId;
    const registerDocId = payment?.cash_register?.documentId;

    return (
        <ProtectedRoute>
            <Layout>
                <div className="p-3">
                    {loading && (
                        <div className="text-center py-5">
                            <span className="spinner-border me-2"></span>Loading payment...
                        </div>
                    )}

                    {error && (
                        <div className="alert alert-danger">
                            {error}
                            <button className="btn btn-outline-secondary btn-sm ms-3" onClick={() => window.history.back()}>
                                Go Back
                            </button>
                        </div>
                    )}

                    {!loading && payment && (
                        <>
                            <div className="d-flex justify-content-between align-items-center mb-3">
                                <h4 className="mb-0">
                                    <i className="fas fa-credit-card me-2"></i>Payment Details
                                </h4>
                                <button className="btn btn-outline-secondary btn-sm" onClick={() => window.history.back()}>
                                    <i className="fas fa-arrow-left me-1"></i>Back
                                </button>
                            </div>

                            {/* Payment info card */}
                            <div className="card mb-3">
                                <div className="card-body">
                                    <div className="row g-3">
                                        <div className="col-6 col-md-3">
                                            <div className="text-muted small">Method</div>
                                            <div className="fw-bold">{payment.payment_method}</div>
                                        </div>
                                        <div className="col-6 col-md-3">
                                            <div className="text-muted small">Amount</div>
                                            <div className={`fw-bold fs-5 ${isRefund ? 'text-danger' : 'text-success'}`}>
                                                {fmt(payment.amount)}
                                            </div>
                                        </div>
                                        <div className="col-6 col-md-3">
                                            <div className="text-muted small">Date</div>
                                            <div>{payment.payment_date ? new Date(payment.payment_date).toLocaleString() : '-'}</div>
                                        </div>
                                        <div className="col-6 col-md-3">
                                            <div className="text-muted small">Transaction No</div>
                                            <div>{payment.transaction_no || '-'}</div>
                                        </div>
                                        {payment.payment_method === 'Cash' && (
                                            <>
                                                <div className="col-6 col-md-3">
                                                    <div className="text-muted small">Cash Received</div>
                                                    <div>{fmt(payment.cash_received)}</div>
                                                </div>
                                                <div className="col-6 col-md-3">
                                                    <div className="text-muted small">Change</div>
                                                    <div>{fmt(payment.change)}</div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Linked source cards */}
                            <h5 className="mb-3">
                                <i className="fas fa-link me-2"></i>Linked To
                            </h5>

                            <div className="row g-3">
                                {/* Sale link */}
                                {saleDocId && (
                                    <div className="col-md-4">
                                        <Link href={`/${saleDocId}/sale`} className="text-decoration-none">
                                            <div className="card border-success h-100" style={{ cursor: 'pointer' }}>
                                                <div className="card-body text-center">
                                                    <i className="fas fa-receipt fa-2x text-success mb-2"></i>
                                                    <h6 className="card-title">Sale</h6>
                                                    <div className="fw-bold">{payment.sale.invoice_no}</div>
                                                    <div className="text-muted small">
                                                        Total: {fmt(payment.sale.total)}
                                                    </div>
                                                    <span className={`badge mt-1 ${payment.sale.payment_status === 'Paid' ? 'bg-success' : 'bg-warning text-dark'}`}>
                                                        {payment.sale.payment_status}
                                                    </span>
                                                    <div className="mt-2 text-success small">
                                                        <i className="fas fa-arrow-right me-1"></i>View Sale
                                                    </div>
                                                </div>
                                            </div>
                                        </Link>
                                    </div>
                                )}

                                {/* Sale Return link */}
                                {returnDocId && (
                                    <div className="col-md-4">
                                        <Link href={`/${returnDocId}/sale-return`} className="text-decoration-none">
                                            <div className="card border-warning h-100" style={{ cursor: 'pointer' }}>
                                                <div className="card-body text-center">
                                                    <i className="fas fa-undo fa-2x text-warning mb-2"></i>
                                                    <h6 className="card-title">{payment.sale_return.type || 'Return'}</h6>
                                                    <div className="fw-bold">{payment.sale_return.return_no}</div>
                                                    <div className="text-muted small">
                                                        Refund: {fmt(payment.sale_return.total_refund)}
                                                    </div>
                                                    <span className={`badge mt-1 ${payment.sale_return.refund_status === 'Refunded' ? 'bg-success' : 'bg-info'}`}>
                                                        {payment.sale_return.refund_status}
                                                    </span>
                                                    <div className="mt-2 text-warning small">
                                                        <i className="fas fa-arrow-right me-1"></i>View Return
                                                    </div>
                                                </div>
                                            </div>
                                        </Link>
                                    </div>
                                )}

                                {/* Cash Register link */}
                                {registerDocId && (
                                    <div className="col-md-4">
                                        <Link href={`/${registerDocId}/cash-register-detail`} className="text-decoration-none">
                                            <div className="card border-primary h-100" style={{ cursor: 'pointer' }}>
                                                <div className="card-body text-center">
                                                    <i className="fas fa-cash-register fa-2x text-primary mb-2"></i>
                                                    <h6 className="card-title">Cash Register</h6>
                                                    <div className="fw-bold">#{payment.cash_register.id}</div>
                                                    <div className="text-muted small">
                                                        {payment.cash_register.branch_name} — {payment.cash_register.desk_name}
                                                    </div>
                                                    <span className={`badge mt-1 ${payment.cash_register.status === 'Active' || payment.cash_register.status === 'Open' ? 'bg-success' : 'bg-secondary'}`}>
                                                        {payment.cash_register.status}
                                                    </span>
                                                    <div className="mt-2 text-primary small">
                                                        <i className="fas fa-arrow-right me-1"></i>View Register
                                                    </div>
                                                </div>
                                            </div>
                                        </Link>
                                    </div>
                                )}

                                {/* No links at all */}
                                {!saleDocId && !returnDocId && !registerDocId && (
                                    <div className="col-12">
                                        <div className="alert alert-light text-muted text-center">
                                            <i className="fas fa-unlink me-2"></i>This payment is not linked to any sale, return, or register.
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() { return { props: {} }; }
