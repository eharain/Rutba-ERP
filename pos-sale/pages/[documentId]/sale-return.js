import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { authApi } from "@rutba/pos-shared/lib/api";
import { useUtil } from "@rutba/pos-shared/context/UtilContext";
import Link from "next/link";
import SaleReturnReceipt from "../../components/print/SaleReturnReceipt";

export default function SaleReturnDetailPage() {
    const router = useRouter();
    const { documentId } = router.query;
    const { currency } = useUtil();

    const [saleReturn, setSaleReturn] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [showPrint, setShowPrint] = useState(false);

    useEffect(() => {
        if (!documentId) return;
        loadSaleReturn();
    }, [documentId]);

    useEffect(() => {
        if (saleReturn && router.query.print === "1") {
            setShowPrint(true);
        }
    }, [saleReturn, router.query.print]);

    function getEntryId(entry) {
        return entry?.documentId || entry?.id;
    }

    async function loadSaleReturn() {
        setLoading(true);
        setError("");
        try {
            const res = await authApi.get(`/sale-returns/${documentId}`, {
                populate: {
                    sale: { populate: { customer: true } },
                    items: { populate: { product: true, items: true } }
                }
            });
            const data = res?.data ?? res;
            if (!data) {
                setError("Sale return not found.");
            } else {
                setSaleReturn(data);
            }
        } catch (err) {
            console.error("Failed to load sale return", err);
            setError("Failed to load sale return.");
        } finally {
            setLoading(false);
        }
    }

    if (showPrint && saleReturn) {
        return <SaleReturnReceipt saleReturn={saleReturn} onClose={() => { setShowPrint(false); router.replace(`/${documentId}/sale-return`, undefined, { shallow: true }); }} />;
    }

    const items = saleReturn?.items || [];
    const totalRefund = Number(saleReturn?.total_refund || 0);

    return (
        <ProtectedRoute>
            <Layout>
                <div className="p-3">
                    {loading && (
                        <div className="text-center py-5">
                            <span className="spinner-border me-2"></span>Loading...
                        </div>
                    )}

                    {error && <div className="alert alert-danger">{error}</div>}

                    {!loading && saleReturn && (
                        <>
                            <div className="d-flex justify-content-between align-items-center mb-3">
                                <h2 className="mb-0">
                                    Return: {saleReturn.return_no}
                                </h2>
                                <div className="d-flex gap-2">
                                    <button className="btn btn-outline-primary" onClick={() => setShowPrint(true)}>
                                        <i className="fas fa-print me-1"></i>Print Receipt
                                    </button>
                                    <Link href="/sales-returns" className="btn btn-outline-secondary">
                                        <i className="fas fa-arrow-left me-1"></i>Back to Returns
                                    </Link>
                                </div>
                            </div>

                            {/* Return header */}
                            <div className="card mb-3">
                                <div className="card-body">
                                    <div className="row">
                                        <div className="col-md-4">
                                            <div className="small text-muted">Return Number</div>
                                            <div className="fw-bold">{saleReturn.return_no}</div>
                                        </div>
                                        <div className="col-md-4">
                                            <div className="small text-muted">Return Date</div>
                                            <div>{saleReturn.return_date ? new Date(saleReturn.return_date).toLocaleString() : "N/A"}</div>
                                        </div>
                                        <div className="col-md-4">
                                            <div className="small text-muted">Type</div>
                                            <span className={`badge ${saleReturn.type === "Exchange" ? "bg-info" : "bg-secondary"}`}>
                                                {saleReturn.type || "Return"}
                                            </span>
                                        </div>
                                    </div>
                                    <hr />
                                    <div className="row">
                                        <div className="col-md-4">
                                            <div className="small text-muted">Original Sale Invoice</div>
                                            <div className="fw-bold">
                                                {saleReturn.sale?.invoice_no ? (
                                                    <Link href={`/${getEntryId(saleReturn.sale)}/sale`}>
                                                        {saleReturn.sale.invoice_no}
                                                    </Link>
                                                ) : "N/A"}
                                            </div>
                                        </div>
                                        <div className="col-md-4">
                                            <div className="small text-muted">Customer</div>
                                            <div>{saleReturn.sale?.customer?.name || "Walk-in Customer"}</div>
                                        </div>
                                        <div className="col-md-4">
                                            <div className="small text-muted">Total Refund</div>
                                            <div className="fw-bold fs-5 text-danger">{currency}{totalRefund.toFixed(2)}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Return items */}
                            <div className="card">
                                <div className="card-body">
                                    <h5 className="card-title mb-3">Returned Items</h5>
                                    {items.length === 0 ? (
                                        <div className="text-muted">No items on this return.</div>
                                    ) : (
                                        <div className="table-responsive">
                                            <table className="table table-sm table-hover mb-0">
                                                <thead className="table-light">
                                                    <tr>
                                                        <th>#</th>
                                                        <th>Product</th>
                                                        <th className="text-center">Quantity</th>
                                                        <th className="text-end">Price</th>
                                                        <th className="text-end">Total</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {items.map((item, idx) => (
                                                        <tr key={getEntryId(item) || idx}>
                                                            <td>{idx + 1}</td>
                                                            <td>{item.product?.name || "N/A"}</td>
                                                            <td className="text-center">{item.quantity || 0}</td>
                                                            <td className="text-end">{currency}{Number(item.price || 0).toFixed(2)}</td>
                                                            <td className="text-end">{currency}{Number(item.total || 0).toFixed(2)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                <tfoot>
                                                    <tr className="fw-bold">
                                                        <td colSpan={4} className="text-end">Total Refund:</td>
                                                        <td className="text-end">{currency}{totalRefund.toFixed(2)}</td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() { return { props: {} }; }
