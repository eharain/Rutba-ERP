import React, { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { StockLevelsEndpoints, WarehousesEndpoints } from "@rutba/api-provider/endpoints";

const PAGE_SIZE = 50;

export default function StockLevelsPage() {
    const { jwt } = useAuth();

    const [rows, setRows] = useState([]);
    const [meta, setMeta] = useState(null);
    const [warehouses, setWarehouses] = useState([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState(null);

    const [warehouseDocId, setWarehouseDocId] = useState("");
    const [inStockOnly, setInStockOnly] = useState(true);
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);

    const loadWarehouses = useCallback(async () => {
        if (!jwt) return;
        try {
            const res = await WarehousesEndpoints.list(1, 200, { sort: ["name:asc"] });
            setWarehouses(res?.data || []);
        } catch (e) { console.error("Failed to load warehouses", e); }
    }, [jwt]);

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        setErr(null);
        try {
            const res = await StockLevelsEndpoints.list(page, PAGE_SIZE, {
                ...(warehouseDocId ? { warehouseDocId } : {}),
                inStockOnly,
                sort: ["quantity_on_hand:desc"],
            });
            setRows(res?.data || []);
            setMeta(res?.meta?.pagination || null);
        } catch (e) {
            console.error("Failed to load stock levels", e);
            setErr("Failed to load stock levels.");
        } finally {
            setLoading(false);
        }
    }, [jwt, page, warehouseDocId, inStockOnly]);

    useEffect(() => { loadWarehouses(); }, [loadWarehouses]);
    useEffect(() => { load(); }, [load]);

    // Reset to page 1 when filters change.
    useEffect(() => { setPage(1); }, [warehouseDocId, inStockOnly]);

    const term = search.trim().toLowerCase();
    const visible = term
        ? rows.filter((r) => {
            const p = r.product || {};
            return (p.name || "").toLowerCase().includes(term) || (p.sku || "").toLowerCase().includes(term);
        })
        : rows;

    const totalOnHand = visible.reduce((s, r) => s + (Number(r.quantity_on_hand) || 0), 0);

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h3><i className="fas fa-layer-group me-2 text-info"></i>Stock by Location</h3>
                    <button className="btn btn-outline-secondary btn-sm" onClick={load} disabled={loading}>
                        <i className="fas fa-rotate me-1"></i>Refresh
                    </button>
                </div>

                <p className="text-muted small mb-3">
                    Per-(product, warehouse) on-hand from the stock-level cache. On-hand = count of InStock units;
                    reserved = Reserved units. This is the denormalised cache — the sum across warehouses equals
                    each product&apos;s global stock quantity.
                </p>

                <div className="row g-2 align-items-end mb-3">
                    <div className="col-md-3">
                        <label className="form-label small mb-1">Warehouse</label>
                        <select className="form-select form-select-sm" value={warehouseDocId} onChange={(e) => setWarehouseDocId(e.target.value)}>
                            <option value="">All warehouses</option>
                            {warehouses.map((w) => <option key={w.documentId} value={w.documentId}>{w.name}</option>)}
                        </select>
                    </div>
                    <div className="col-md-4">
                        <label className="form-label small mb-1">Search product (this page)</label>
                        <input className="form-control form-control-sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="name or SKU…" />
                    </div>
                    <div className="col-md-3">
                        <div className="form-check mt-4">
                            <input className="form-check-input" type="checkbox" id="inStockOnly" checked={inStockOnly} onChange={(e) => setInStockOnly(e.target.checked)} />
                            <label className="form-check-label small" htmlFor="inStockOnly">In-stock only (on-hand &gt; 0)</label>
                        </div>
                    </div>
                </div>

                {err && <div className="alert alert-danger py-2">{err}</div>}

                {loading ? (
                    <div className="text-center py-5"><div className="spinner-border"></div></div>
                ) : visible.length === 0 ? (
                    <div className="alert alert-info">No stock levels match. {rows.length > 0 && term ? "Try clearing the search." : ""}</div>
                ) : (
                    <>
                        <div className="table-responsive">
                            <table className="table table-sm table-hover align-middle">
                                <thead>
                                    <tr>
                                        <th>Product</th>
                                        <th>SKU</th>
                                        <th>Warehouse</th>
                                        <th className="text-end">On hand</th>
                                        <th className="text-end">Reserved</th>
                                        <th className="text-end">Available</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visible.map((r) => (
                                        <tr key={r.documentId || r.id}>
                                            <td>{r.product?.name || r.product?.sku || <span className="text-muted">{r.product ? "(unnamed product)" : "(no product)"}</span>}</td>
                                            <td><code>{r.product?.sku || "—"}</code></td>
                                            <td>{r.warehouse?.name || "—"}{r.batch?.batch_code ? <span className="badge bg-light text-dark border ms-2">{r.batch.batch_code}</span> : null}</td>
                                            <td className="text-end fw-semibold">{r.quantity_on_hand ?? 0}</td>
                                            <td className="text-end">{r.quantity_reserved ?? 0}</td>
                                            <td className="text-end">{r.quantity_available ?? r.quantity_on_hand ?? 0}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="table-light">
                                        <td colSpan={3} className="fw-semibold">Page total ({visible.length} rows)</td>
                                        <td className="text-end fw-semibold">{totalOnHand}</td>
                                        <td colSpan={2}></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        {meta && (
                            <div className="d-flex justify-content-between align-items-center">
                                <span className="text-muted small">
                                    Page {meta.page} of {meta.pageCount} · {meta.total} rows total
                                </span>
                                <div className="btn-group btn-group-sm">
                                    <button className="btn btn-outline-secondary" disabled={loading || meta.page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                                        <i className="fas fa-angle-left"></i> Prev
                                    </button>
                                    <button className="btn btn-outline-secondary" disabled={loading || meta.page >= meta.pageCount} onClick={() => setPage((p) => p + 1)}>
                                        Next <i className="fas fa-angle-right"></i>
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </Layout>
        </ProtectedRoute>
    );
}
