import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { authApi } from "@rutba/pos-shared/lib/api";
import { fetchSaleByIdOrInvoice } from "@rutba/pos-shared/lib/pos";
import { useUtil } from "@rutba/pos-shared/context/UtilContext";
import Link from "next/link";
import SaleReturnReceipt from "../../components/print/SaleReturnReceipt";

const RETURN_STATUSES = ["Returned", "ReturnedDamaged", "Damaged", "InStock"];

function getEntryId(entry) {
    return entry?.documentId || entry?.id;
}

// ── Detail view for an existing sale return ──
function SaleReturnDetail({ documentId }) {
    const router = useRouter();
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
    );
}

// ── Create view for a new sale return ──
function NewSaleReturn() {
    const router = useRouter();
    const { currency, branch } = useUtil();
    const scanInputRef = useRef(null);

    const [scanValue, setScanValue] = useState("");
    const [sale, setSale] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const [returnItems, setReturnItems] = useState([]);
    const [processing, setProcessing] = useState(false);
    const [returnResult, setReturnResult] = useState(null);

    useEffect(() => {
        if (scanInputRef.current) scanInputRef.current.focus();
    }, [sale]);

    async function handleScan(e) {
        if (e.key !== "Enter") return;
        const value = scanValue.trim();
        if (!value) return;
        setError("");
        setSale(null);
        setReturnItems([]);
        setReturnResult(null);
        setLoading(true);
        try {
            const saleData = await fetchSaleByIdOrInvoice(value);
            if (!saleData) {
                setError(`No sale found for "${value}"`);
                return;
            }
            if (saleData.return_status === "Returned") {
                setError(`Sale "${saleData.invoice_no}" has already been fully returned. No further returns are allowed.`);
                return;
            }
            if (saleData.sale_returns && saleData.sale_returns.length > 0) {
                setError(`Sale "${saleData.invoice_no}" already has a return (${saleData.sale_returns.map(r => r.return_no).join(", ")}). No further returns are allowed.`);
                return;
            }
            setSale(saleData);
        } catch (err) {
            console.error("Failed to load sale", err);
            setError("Failed to load sale. Check the invoice number and try again.");
        } finally {
            setLoading(false);
            setScanValue("");
        }
    }

    function toggleStockItem(saleItem, stockItem) {
        const stockDocId = getEntryId(stockItem);
        const product = saleItem.product;
        if (product && product.is_returnable === false) return;
        setReturnItems(prev => {
            const exists = prev.find(r => r.stockItemDocId === stockDocId);
            if (exists) {
                return prev.filter(r => r.stockItemDocId !== stockDocId);
            }
            return [...prev, {
                saleItemDocId: getEntryId(saleItem),
                saleItemId: saleItem.id,
                stockItemDocId: stockDocId,
                stockItemId: stockItem.id,
                productDocId: getEntryId(saleItem.product),
                productName: saleItem.product?.name || stockItem.name || "N/A",
                sku: stockItem.sku || saleItem.product?.sku || "",
                barcode: stockItem.barcode || "",
                price: Number(saleItem.price) || Number(stockItem.selling_price) || 0,
                status: "Returned"
            }];
        });
    }

    function setItemReturnStatus(stockDocId, status) {
        setReturnItems(prev =>
            prev.map(r => r.stockItemDocId === stockDocId ? { ...r, status } : r)
        );
    }

    function selectAllFromSaleItem(saleItem) {
        const product = saleItem.product;
        if (product && product.is_returnable === false) return;
        const stockItems = saleItem.items || [];
        const eligibleItems = stockItems.filter(si => si.status === "Sold");
        const allSelected = eligibleItems.every(si =>
            returnItems.some(r => r.stockItemDocId === getEntryId(si))
        );

        if (allSelected) {
            const stockDocIds = new Set(eligibleItems.map(si => getEntryId(si)));
            setReturnItems(prev => prev.filter(r => !stockDocIds.has(r.stockItemDocId)));
        } else {
            setReturnItems(prev => {
                const existing = new Set(prev.map(r => r.stockItemDocId));
                const newEntries = eligibleItems
                    .filter(si => !existing.has(getEntryId(si)))
                    .map(si => ({
                        saleItemDocId: getEntryId(saleItem),
                        saleItemId: saleItem.id,
                        stockItemDocId: getEntryId(si),
                        stockItemId: si.id,
                        productDocId: getEntryId(saleItem.product),
                        productName: saleItem.product?.name || si.name || "N/A",
                        sku: si.sku || saleItem.product?.sku || "",
                        barcode: si.barcode || "",
                        price: Number(saleItem.price) || Number(si.selling_price) || 0,
                        status: "Returned"
                    }));
                return [...prev, ...newEntries];
            });
        }
    }

    async function processReturn() {
        if (returnItems.length === 0) return alert("Select items to return");
        if (!sale) return;
        if (!confirm(`Process return for ${returnItems.length} item(s)?`)) return;

        setProcessing(true);
        setReturnResult(null);
        try {
            const saleDocId = getEntryId(sale);
            const totalRefund = returnItems.reduce((sum, r) => sum + r.price, 0);

            const returnNo = "RET-" + Date.now().toString(36).toUpperCase();

            // 1) Create sale-return header
            const retRes = await authApi.post("/sale-returns", {
                data: {
                    return_no: returnNo,
                    return_date: new Date().toISOString(),
                    total_refund: totalRefund,
                    type: "Return",
                    sale: { connect: [saleDocId] },
                    ...(branch ? { branches: { connect: [getEntryId(branch)] } } : {})
                }
            });
            const saleReturn = retRes?.data ?? retRes;
            const saleReturnDocId = getEntryId(saleReturn);

            if (!saleReturnDocId) {
                setReturnResult({ success: false, message: "Failed to create return header." });
                return;
            }

            // 2) Group return items by sale item
            const bySaleItem = {};
            for (const ri of returnItems) {
                if (!bySaleItem[ri.saleItemDocId]) {
                    bySaleItem[ri.saleItemDocId] = [];
                }
                bySaleItem[ri.saleItemDocId].push(ri);
            }

            // 3) For each sale item group, create a sale-return-item and update stock items
            for (const [saleItemDocId, items] of Object.entries(bySaleItem)) {
                const quantity = items.length;
                const price = items[0].price;
                const total = items.reduce((s, i) => s + i.price, 0);
                const productDocId = items[0].productDocId;

                const returnItemRes = await authApi.post("/sale-return-items", {
                    data: {
                        quantity,
                        price,
                        total,
                        sale_return: { connect: [saleReturnDocId] },
                        product: productDocId ? { connect: [productDocId] } : undefined
                    }
                });
                const returnItem = returnItemRes?.data ?? returnItemRes;
                const returnItemDocId = getEntryId(returnItem);

                // 4) Update each stock item: change status and link to sale_return_item
                for (const ri of items) {
                    await authApi.put(`/stock-items/${ri.stockItemDocId}`, {
                        data: {
                            status: ri.status,
                            sale_return_item: returnItemDocId
                                ? { connect: [returnItemDocId] }
                                : undefined
                        }
                    });
                }
            }

            // 5) Mark the sale as returned
            await authApi.put(`/sales/${saleDocId}`, {
                data: {
                    return_status: "Returned"
                }
            });

            setReturnResult({
                success: true,
                message: `Return ${returnNo} created — ${returnItems.length} item(s), refund ${currency}${totalRefund.toFixed(2)}`,
                saleReturnDocId
            });
            setReturnItems([]);
            setSale(null);

        } catch (err) {
            console.error("Failed to process return", err);
            setReturnResult({ success: false, message: "Failed to process return. See console for details." });
        } finally {
            setProcessing(false);
        }
    }

    function clearSale() {
        setSale(null);
        setReturnItems([]);
        setError("");
        setReturnResult(null);
        setScanValue("");
        if (scanInputRef.current) scanInputRef.current.focus();
    }

    const saleItems = sale?.items || [];
    const totalRefund = returnItems.reduce((sum, r) => sum + r.price, 0);

    return (
        <div className="p-3">
            <div className="d-flex justify-content-between align-items-center mb-3">
                <h1 className="mb-0">New Sale Return</h1>
                <button className="btn btn-outline-secondary" onClick={() => router.push("/sales-returns")}>
                    <i className="fas fa-arrow-left me-1"></i>Back to Returns
                </button>
            </div>

            {/* Scan input */}
            <div className="card mb-3">
                <div className="card-body">
                    <div className="row g-2 align-items-end">
                        <div className="col-md-6">
                            <label className="form-label small mb-1">Scan Invoice QR / Enter Invoice Number</label>
                            <input
                                ref={scanInputRef}
                                type="text"
                                className="form-control"
                                placeholder="Scan QR code or type invoice number and press Enter..."
                                value={scanValue}
                                onChange={e => setScanValue(e.target.value)}
                                onKeyDown={handleScan}
                                autoFocus
                                disabled={loading}
                            />
                        </div>
                        <div className="col-auto">
                            <button
                                className="btn btn-primary"
                                onClick={() => handleScan({ key: "Enter" })}
                                disabled={loading || !scanValue.trim()}
                            >
                                {loading ? (<><span className="spinner-border spinner-border-sm me-1"></span>Loading...</>) : (<><i className="fas fa-search me-1"></i>Lookup</>)}
                            </button>
                        </div>
                        {sale && (
                            <div className="col-auto">
                                <button className="btn btn-outline-secondary" onClick={clearSale}>
                                    <i className="fas fa-times me-1"></i>Clear
                                </button>
                            </div>
                        )}
                    </div>
                    {error && <div className="alert alert-danger mt-2 mb-0">{error}</div>}
                </div>
            </div>

            {/* Return result */}
            {returnResult && (
                <div className={`alert ${returnResult.success ? "alert-success" : "alert-danger"} mb-3`}>
                    {returnResult.message}
                    {returnResult.success && returnResult.saleReturnDocId && (
                        <div className="mt-2">
                            <button className="btn btn-sm btn-outline-success me-2" onClick={() => router.push(`/${returnResult.saleReturnDocId}/sale-return`)}>
                                <i className="fas fa-eye me-1"></i>View Return
                            </button>
                            <button className="btn btn-sm btn-outline-primary" onClick={() => router.push(`/${returnResult.saleReturnDocId}/sale-return?print=1`)}>
                                <i className="fas fa-print me-1"></i>Print Receipt
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Sale details & items */}
            {sale && (
                <div className="row">
                    <div className="col-lg-8">
                        {/* Sale header */}
                        <div className="card mb-3">
                            <div className="card-body">
                                <div className="d-flex justify-content-between align-items-start">
                                    <div>
                                        <h5 className="card-title mb-1">
                                            Invoice: {sale.invoice_no}
                                        </h5>
                                        <div className="text-muted small">
                                            {sale.sale_date ? new Date(sale.sale_date).toLocaleString() : "N/A"}
                                            {sale.customer?.name && (
                                                <span className="ms-2">• Customer: {sale.customer.name}</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="text-end">
                                        <div className="small text-muted">Sale Total</div>
                                        <div className="fw-bold">{currency}{Number(sale.total || 0).toFixed(2)}</div>
                                        <span className={`badge ${sale.payment_status === "Paid" ? "bg-success" : "bg-warning"}`}>
                                            {sale.payment_status || "N/A"}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Sale items with stock items */}
                        {saleItems.length === 0 ? (
                            <div className="alert alert-info">No items found on this sale.</div>
                        ) : (
                            saleItems.map(saleItem => {
                                const stockItems = saleItem.items || [];
                                const product = saleItem.product;
                                const isReturnable = product?.is_returnable !== false;
                                const isExchangeable = product?.is_exchangeable !== false;
                                const soldStockItems = stockItems.filter(si => si.status === "Sold");
                                const nonSoldStockItems = stockItems.filter(si => si.status !== "Sold");
                                const selectedCount = isReturnable ? soldStockItems.filter(si =>
                                    returnItems.some(r => r.stockItemDocId === getEntryId(si))
                                ).length : 0;

                                return (
                                    <div key={getEntryId(saleItem)} className="card mb-2">
                                        <div className="card-body p-3">
                                            <div className="d-flex justify-content-between align-items-center mb-2">
                                                <div>
                                                    <strong>{saleItem.product?.name || "N/A"}</strong>
                                                    <span className="text-muted ms-2 small">
                                                        Qty: {saleItem.quantity} × {currency}{Number(saleItem.price || 0).toFixed(2)}
                                                    </span>
                                                    {!isReturnable && (
                                                        <span className="badge bg-danger ms-2" title="This product cannot be returned">
                                                            <i className="fas fa-ban me-1"></i>Non-Returnable
                                                        </span>
                                                    )}
                                                    {!isExchangeable && isReturnable && (
                                                        <span className="badge bg-warning text-dark ms-2" title="This product cannot be exchanged">
                                                            <i className="fas fa-exchange-alt me-1"></i>Non-Exchangeable
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="d-flex gap-2 align-items-center">
                                                    {isReturnable && soldStockItems.length > 0 && (
                                                        <button
                                                            className={`btn btn-sm ${selectedCount === soldStockItems.length ? "btn-outline-secondary" : "btn-outline-primary"}`}
                                                            onClick={() => selectAllFromSaleItem(saleItem)}
                                                        >
                                                            {selectedCount === soldStockItems.length ? "Deselect All" : "Select All"}
                                                        </button>
                                                    )}
                                                    <span className="badge bg-secondary">
                                                        {selectedCount}/{soldStockItems.length} returnable
                                                    </span>
                                                </div>
                                            </div>

                                            {stockItems.length === 0 ? (
                                                <div className="text-muted small">No stock items linked to this sale item.</div>
                                            ) : (
                                                <div className="table-responsive">
                                                    <table className="table table-sm table-hover mb-0">
                                                        <thead className="table-light">
                                                            <tr>
                                                                <th style={{ width: 40 }}></th>
                                                                <th>SKU</th>
                                                                <th>Barcode</th>
                                                                <th>Current Status</th>
                                                                <th>Return As</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {stockItems.map(si => {
                                                                const siDocId = getEntryId(si);
                                                                const isSold = si.status === "Sold";
                                                                const canReturn = isSold && isReturnable;
                                                                const selected = returnItems.find(r => r.stockItemDocId === siDocId);
                                                                return (
                                                                    <tr key={siDocId} className={selected ? "table-warning" : !isReturnable ? "table-light" : ""}>
                                                                        <td>
                                                                            {canReturn ? (
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={!!selected}
                                                                                    onChange={() => toggleStockItem(saleItem, si)}
                                                                                />
                                                                            ) : (
                                                                                <span className="text-muted" title={!isReturnable ? "Non-returnable product" : "Only sold items can be returned"}>—</span>
                                                                            )}
                                                                        </td>
                                                                        <td><code>{si.sku || "-"}</code></td>
                                                                        <td>
                                                                            <code className="small">{si.barcode || "-"}</code>
                                                                        </td>
                                                                        <td>
                                                                            <span className={`badge ${isSold ? "bg-secondary" : "bg-info"}`}>
                                                                                {si.status}
                                                                            </span>
                                                                        </td>
                                                                        <td>
                                                                            {selected ? (
                                                                                <select
                                                                                    className="form-select form-select-sm"
                                                                                    value={selected.status}
                                                                                    onChange={e => setItemReturnStatus(siDocId, e.target.value)}
                                                                                    style={{ width: "auto", minWidth: 150 }}
                                                                                >
                                                                                    {RETURN_STATUSES.map(s => (
                                                                                        <option key={s} value={s}>{s}</option>
                                                                                    ))}
                                                                                </select>
                                                                            ) : (
                                                                                <span className="text-muted small">—</span>
                                                                            )}
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}

                                            {!isReturnable && (
                                                <div className="text-danger small mt-1">
                                                    <i className="fas fa-ban me-1"></i>This product is marked as non-returnable and cannot be returned.
                                                </div>
                                            )}

                                            {isReturnable && nonSoldStockItems.length > 0 && soldStockItems.length === 0 && (
                                                <div className="text-muted small mt-1">
                                                    All stock items for this line have already been returned or are no longer in &quot;Sold&quot; status.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Right column: return summary */}
                    <div className="col-lg-4">
                        <div className="card mb-3">
                            <div className="card-body">
                                <h5 className="card-title">Return Summary</h5>
                                {returnItems.length === 0 ? (
                                    <div className="text-muted">Select items to return from the sale.</div>
                                ) : (
                                    <>
                                        <ul className="list-group list-group-flush mb-3">
                                            {returnItems.map(ri => (
                                                <li key={ri.stockItemDocId} className="list-group-item d-flex justify-content-between align-items-start px-0">
                                                    <div>
                                                        <div className="small fw-bold">{ri.productName}</div>
                                                        <div className="small text-muted">
                                                            {ri.sku || ri.barcode || "—"}
                                                        </div>
                                                        <span className={`badge ${ri.status === "Returned" ? "bg-success" : ri.status === "ReturnedDamaged" ? "bg-warning text-dark" : "bg-danger"}`}>
                                                            → {ri.status}
                                                        </span>
                                                    </div>
                                                    <div className="text-end">
                                                        <div className="small">{currency}{ri.price.toFixed(2)}</div>
                                                        <button
                                                            className="btn btn-sm btn-outline-danger mt-1"
                                                            onClick={() => setReturnItems(prev => prev.filter(r => r.stockItemDocId !== ri.stockItemDocId))}
                                                        >
                                                            <i className="fas fa-times"></i>
                                                        </button>
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                        <div className="d-flex justify-content-between fw-bold mb-3">
                                            <span>Total Refund:</span>
                                            <span>{currency}{totalRefund.toFixed(2)}</span>
                                        </div>
                                        <button
                                            className="btn btn-danger w-100"
                                            onClick={processReturn}
                                            disabled={processing}
                                        >
                                            {processing ? (<><span className="spinner-border spinner-border-sm me-1"></span>Processing...</>) : (<><i className="fas fa-undo me-1"></i>{`Process Return (${returnItems.length} items)`}</>)}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Page component: routes between create and detail ──
export default function SaleReturnDetailPage() {
    const router = useRouter();
    const { documentId } = router.query;
    const isNew = documentId === "new";

    return (
        <ProtectedRoute>
            <Layout>
                {isNew ? <NewSaleReturn /> : <SaleReturnDetail documentId={documentId} />}
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() { return { props: {} }; }
