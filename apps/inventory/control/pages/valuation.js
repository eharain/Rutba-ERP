import React, { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { StockLevelsEndpoints } from "@rutba/api-provider/endpoints";

// Inventory valuation v1 — value = Σ (stock-level on-hand × product.cost_price),
// grouped by branch. Approximate: it uses the product's reference cost_price
// (not per-unit stock_item.cost_price). Rows with a null cost contribute nothing.
export default function ValuationPage() {
    const { jwt } = useAuth();
    const [byBranch, setByBranch] = useState([]);
    const [topProducts, setTopProducts] = useState([]);
    const [totals, setTotals] = useState({ value: 0, units: 0, rows: 0, missingCost: 0 });
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState(null);

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        setErr(null);
        try {
            // Page through the whole cache (in-stock rows only).
            const PAGE = 500;
            let page = 1, pageCount = 1;
            const rows = [];
            do {
                const res = await StockLevelsEndpoints.list(page, PAGE, { inStockOnly: true, sort: ["id:asc"] });
                rows.push(...(res?.data || []));
                pageCount = res?.meta?.pagination?.pageCount || 1;
                page += 1;
            } while (page <= pageCount && page <= 40); // hard cap 20k rows

            const brMap = new Map();  // branch name -> { value, units }
            const prodMap = new Map(); // product key -> { name, sku, units, value }
            let totalValue = 0, totalUnits = 0, missingCost = 0;

            for (const r of rows) {
                const oh = Number(r.quantity_on_hand) || 0;
                if (oh <= 0) continue;
                const cost = Number(r.product?.cost_price);
                const hasCost = Number.isFinite(cost) && cost > 0;
                if (!hasCost) missingCost += 1;
                const value = hasCost ? oh * cost : 0;
                totalValue += value; totalUnits += oh;

                const brName = r.branch?.name || "(unassigned)";
                const w = brMap.get(brName) || { value: 0, units: 0 };
                w.value += value; w.units += oh; brMap.set(brName, w);

                const pk = r.product?.documentId || r.product?.id || `row:${r.id}`;
                const p = prodMap.get(pk) || { name: r.product?.name || "(unnamed)", sku: r.product?.sku || "", units: 0, value: 0 };
                p.units += oh; p.value += value; prodMap.set(pk, p);
            }

            setByBranch([...brMap.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.value - a.value));
            setTopProducts([...prodMap.values()].sort((a, b) => b.value - a.value).slice(0, 25));
            setTotals({ value: totalValue, units: totalUnits, rows: rows.length, missingCost });
        } catch (e) {
            console.error("Failed to compute valuation", e);
            setErr("Failed to compute valuation.");
        } finally {
            setLoading(false);
        }
    }, [jwt]);

    useEffect(() => { load(); }, [load]);

    const money = (n) => (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h3><i className="fas fa-coins me-2 text-warning"></i>Inventory Valuation</h3>
                    <button className="btn btn-outline-secondary btn-sm" onClick={load} disabled={loading}><i className="fas fa-rotate me-1"></i>Recompute</button>
                </div>
                <p className="text-muted small mb-3">
                    On-hand × product cost, from the stock-level cache. Approximate — uses each product&apos;s
                    reference cost price; units on products with no cost are counted but valued at 0.
                </p>

                {err && <div className="alert alert-danger py-2">{err}</div>}

                {loading ? (
                    <div className="text-center py-5"><div className="spinner-border"></div></div>
                ) : (
                    <>
                        <div className="row g-3 mb-4">
                            <div className="col-md-4">
                                <div className="card border-warning h-100"><div className="card-body">
                                    <div className="text-muted small">Total inventory value</div>
                                    <div className="h3 mb-0">{money(totals.value)}</div>
                                </div></div>
                            </div>
                            <div className="col-md-4">
                                <div className="card border-info h-100"><div className="card-body">
                                    <div className="text-muted small">Units on hand</div>
                                    <div className="h3 mb-0">{totals.units.toLocaleString()}</div>
                                </div></div>
                            </div>
                            <div className="col-md-4">
                                <div className="card border-secondary h-100"><div className="card-body">
                                    <div className="text-muted small">Stock-level rows · missing cost</div>
                                    <div className="h3 mb-0">{totals.rows.toLocaleString()} · <span className={totals.missingCost ? "text-danger" : ""}>{totals.missingCost}</span></div>
                                </div></div>
                            </div>
                        </div>

                        <div className="row g-4">
                            <div className="col-md-5">
                                <h6>By branch</h6>
                                <div className="table-responsive">
                                    <table className="table table-sm align-middle">
                                        <thead><tr><th>Branch</th><th className="text-end">Units</th><th className="text-end">Value</th></tr></thead>
                                        <tbody>
                                            {byBranch.map((w) => (
                                                <tr key={w.name}><td>{w.name}</td><td className="text-end">{w.units.toLocaleString()}</td><td className="text-end fw-semibold">{money(w.value)}</td></tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            <div className="col-md-7">
                                <h6>Top products by value</h6>
                                <div className="table-responsive">
                                    <table className="table table-sm table-hover align-middle">
                                        <thead><tr><th>Product</th><th>SKU</th><th className="text-end">Units</th><th className="text-end">Value</th></tr></thead>
                                        <tbody>
                                            {topProducts.map((p, i) => (
                                                <tr key={i}><td>{p.name}</td><td><code>{p.sku || "—"}</code></td><td className="text-end">{p.units.toLocaleString()}</td><td className="text-end fw-semibold">{money(p.value)}</td></tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </Layout>
        </ProtectedRoute>
    );
}
