import { useEffect, useRef, useState } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "../components/ProtectedRoute";
import { authApi } from "../lib/api";
import { fetchSaleByIdOrInvoice } from "../lib/pos";
import { useUtil } from "../context/UtilContext";

const RETURN_STATUSES = ["Returned", "ReturnedDamaged", "Damaged","InStock"];

export default function SalesReturnsPage() {
    const { currency, branch } = useUtil();
    const scanInputRef = useRef(null);

    const [scanValue, setScanValue] = useState("");
    const [sale, setSale] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // Each entry: { saleItemId, stockItemDocId, productName, sku, price, status }
    const [returnItems, setReturnItems] = useState([]);
    const [processing, setProcessing] = useState(false);
    const [returnResult, setReturnResult] = useState(null);

    // Recent returns list
    const [recentReturns, setRecentReturns] = useState([]);

    useEffect(() => {
        loadRecentReturns();
    }, []);

    useEffect(() => {
        if (scanInputRef.current) scanInputRef.current.focus();
    }, [sale]);

    function getEntryId(entry) {
        return entry?.documentId || entry?.id;
    }

    async function loadRecentReturns() {
        try {
            const res = await authApi.fetch("/sale-returns", {
                sort: ["createdAt:desc"],
                populate: { sale: true, items: { populate: { product: true } } },
                pagination: { page: 1, pageSize: 10 }
            });
            setRecentReturns(res?.data ?? []);
        } catch (err) {
            console.error("Failed to load recent returns", err);
        }
    }

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
        const stockItems = saleItem.items || [];
        const eligibleItems = stockItems.filter(si => si.status === "Sold");
        const allSelected = eligibleItems.every(si =>
            returnItems.some(r => r.stockItemDocId === getEntryId(si))
        );

        if (allSelected) {
            // Deselect all from this sale item
            const stockDocIds = new Set(eligibleItems.map(si => getEntryId(si)));
            setReturnItems(prev => prev.filter(r => !stockDocIds.has(r.stockItemDocId)));
        } else {
            // Select all eligible from this sale item
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

            // Generate return number
            const returnNo = "RET-" + Date.now().toString(36).toUpperCase();

            // 1) Create sale-return header
            const retRes = await authApi.post("/sale-returns", {
                data: {
                    return_no: returnNo,
                    return_date: new Date().toISOString(),
                    total_refund: totalRefund,
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

            setReturnResult({
                success: true,
                message: `Return ${returnNo} created — ${returnItems.length} item(s), refund ${currency}${totalRefund.toFixed(2)}`
            });
            setReturnItems([]);
            setSale(null);
            await loadRecentReturns();

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
        <ProtectedRoute>
            <Layout>
                <div className="p-3">
                    <h1 className="mb-3">Sales Returns</h1>

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
                                        {loading ? "Loading..." : "Lookup"}
                                    </button>
                                </div>
                                {sale && (
                                    <div className="col-auto">
                                        <button className="btn btn-outline-secondary" onClick={clearSale}>
                                            Clear
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
                                        const soldStockItems = stockItems.filter(si => si.status === "Sold");
                                        const nonSoldStockItems = stockItems.filter(si => si.status !== "Sold");
                                        const selectedCount = soldStockItems.filter(si =>
                                            returnItems.some(r => r.stockItemDocId === getEntryId(si))
                                        ).length;

                                        return (
                                            <div key={getEntryId(saleItem)} className="card mb-2">
                                                <div className="card-body p-3">
                                                    <div className="d-flex justify-content-between align-items-center mb-2">
                                                        <div>
                                                            <strong>{saleItem.product?.name || "N/A"}</strong>
                                                            <span className="text-muted ms-2 small">
                                                                Qty: {saleItem.quantity} × {currency}{Number(saleItem.price || 0).toFixed(2)}
                                                            </span>
                                                        </div>
                                                        <div className="d-flex gap-2 align-items-center">
                                                            {soldStockItems.length > 0 && (
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
                                                                        const selected = returnItems.find(r => r.stockItemDocId === siDocId);
                                                                        return (
                                                                            <tr key={siDocId} className={selected ? "table-warning" : ""}>
                                                                                <td>
                                                                                    {isSold ? (
                                                                                        <input
                                                                                            type="checkbox"
                                                                                            checked={!!selected}
                                                                                            onChange={() => toggleStockItem(saleItem, si)}
                                                                                        />
                                                                                    ) : (
                                                                                        <span className="text-muted" title="Only sold items can be returned">—</span>
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

                                                    {nonSoldStockItems.length > 0 && soldStockItems.length === 0 && (
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
                                                                    ✕
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
                                                    {processing ? "Processing..." : `Process Return (${returnItems.length} items)`}
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Recent returns */}
                    {!sale && (
                        <div className="card">
                            <div className="card-body">
                                <h5 className="card-title">Recent Returns</h5>
                                {recentReturns.length === 0 ? (
                                    <div className="text-muted">No recent returns.</div>
                                ) : (
                                    <div className="table-responsive">
                                        <table className="table table-sm table-hover mb-0">
                                            <thead className="table-light">
                                                <tr>
                                                    <th>Return No</th>
                                                    <th>Date</th>
                                                    <th>Sale Invoice</th>
                                                    <th>Items</th>
                                                    <th>Refund</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {recentReturns.map(ret => (
                                                    <tr key={getEntryId(ret)}>
                                                        <td><strong>{ret.return_no || "-"}</strong></td>
                                                        <td>{ret.return_date ? new Date(ret.return_date).toLocaleString() : "-"}</td>
                                                        <td>{ret.sale?.invoice_no || "-"}</td>
                                                        <td>{ret.items?.length || 0}</td>
                                                        <td>{currency}{Number(ret.total_refund || 0).toFixed(2)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </Layout>
        </ProtectedRoute>
    );
}