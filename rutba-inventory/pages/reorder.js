import React, { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { ProductsEndpoints } from "@rutba/api-provider/endpoints";

// v1 reorder view: products flagged low (positive but at/below reorder_level) or
// out of stock (<= 0). Suggested qty is a simple default (a reorder-point's
// worth) until per-product min/max/safety policies land.
export default function ReorderPage() {
    const { jwt } = useAuth();

    const [mode, setMode] = useState("low"); // 'low' | 'outOfStock'
    const [rows, setRows] = useState([]);
    const [meta, setMeta] = useState(null);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState(null);
    const [search, setSearch] = useState("");

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        setErr(null);
        try {
            const res = await ProductsEndpoints.list(1, 500, {
                stockStatus: mode,
                parentOnly: false,
                sort: "stock_quantity:asc",
                populate: { suppliers: true },
            });
            setRows(res?.data || []);
            setMeta(res?.meta?.pagination || null);
        } catch (e) {
            console.error("Failed to load reorder list", e);
            setErr("Failed to load reorder list.");
        } finally {
            setLoading(false);
        }
    }, [jwt, mode]);

    useEffect(() => { load(); }, [load]);

    const term = search.trim().toLowerCase();
    const visible = term
        ? rows.filter((p) => (p.name || "").toLowerCase().includes(term) || (p.sku || "").toLowerCase().includes(term))
        : rows;

    const suggestQty = (p) => {
        const rl = Number(p.reorder_level) || 0;
        const oh = Number(p.stock_quantity) || 0;
        // Order up to ~2x the reorder point; never less than the point itself.
        return Math.max(rl * 2 - oh, rl, 1);
    };
    const supplierNames = (p) => (Array.isArray(p.suppliers) ? p.suppliers.map((s) => s.name).filter(Boolean).join(", ") : "");

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h3><i className="fas fa-cart-arrow-down me-2 text-danger"></i>Reorder</h3>
                    <button className="btn btn-outline-secondary btn-sm" onClick={load} disabled={loading}><i className="fas fa-rotate me-1"></i>Refresh</button>
                </div>

                <p className="text-muted small mb-3">
                    Products at or below their reorder point, or out of stock. Suggested quantity is a default
                    (a reorder-point&apos;s worth) — per-product min/max policies and draft-PO generation are next.
                </p>

                <div className="d-flex gap-2 align-items-end mb-3 flex-wrap">
                    <div className="btn-group btn-group-sm" role="group">
                        <button className={`btn ${mode === "low" ? "btn-danger" : "btn-outline-danger"}`} onClick={() => setMode("low")}>
                            <i className="fas fa-triangle-exclamation me-1"></i>Low stock
                        </button>
                        <button className={`btn ${mode === "outOfStock" ? "btn-dark" : "btn-outline-dark"}`} onClick={() => setMode("outOfStock")}>
                            <i className="fas fa-ban me-1"></i>Out of stock
                        </button>
                    </div>
                    <div style={{ maxWidth: 320 }} className="flex-grow-1">
                        <input className="form-control form-control-sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="search product name or SKU…" />
                    </div>
                </div>

                {err && <div className="alert alert-danger py-2">{err}</div>}

                {loading ? (
                    <div className="text-center py-5"><div className="spinner-border"></div></div>
                ) : visible.length === 0 ? (
                    <div className="alert alert-success">
                        {mode === "low"
                            ? "No products at or below their reorder point. 🎉"
                            : "No products are out of stock. 🎉"}
                        {rows.length > 0 && term ? " (filtered — clear the search to see all)" : ""}
                    </div>
                ) : (
                    <>
                        <div className="table-responsive">
                            <table className="table table-sm table-hover align-middle">
                                <thead>
                                    <tr>
                                        <th>Product</th>
                                        <th>SKU</th>
                                        <th className="text-end">On hand</th>
                                        <th className="text-end">Reorder point</th>
                                        <th className="text-end">Suggested</th>
                                        <th>Supplier(s)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visible.map((p) => (
                                        <tr key={p.documentId || p.id}>
                                            <td>{p.name || <span className="text-muted">(unnamed)</span>}</td>
                                            <td><code>{p.sku || "—"}</code></td>
                                            <td className="text-end">
                                                <span className={`fw-semibold ${(Number(p.stock_quantity) || 0) <= 0 ? "text-danger" : "text-warning"}`}>{p.stock_quantity ?? 0}</span>
                                            </td>
                                            <td className="text-end">{p.reorder_level ?? "—"}</td>
                                            <td className="text-end fw-semibold">{p.reorder_level ? suggestQty(p) : "—"}</td>
                                            <td className="small">{supplierNames(p) || <span className="text-muted">—</span>}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="text-muted small">
                            {visible.length} product(s){meta?.total != null && meta.total !== visible.length ? ` of ${meta.total}` : ""}.
                            {mode === "low" ? " Set each product's reorder level in Stock Management to tune this list." : ""}
                        </div>
                    </>
                )}
            </Layout>
        </ProtectedRoute>
    );
}
