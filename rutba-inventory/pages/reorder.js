import React, { useState, useEffect, useCallback, useMemo } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { ReorderPoliciesEndpoints } from "@rutba/api-provider/endpoints";

// Reorder dashboard — driven by the reorder-policy suggestion engine
// (per-product min/max/safety policies + legacy reorder_level fallback). Rows
// are triggered targets with on-hand / on-order / projected and a suggested
// quantity; select rows to generate draft purchases (by supplier) or draft
// work-orders (for made-in-house goods).
const keyOf = (r) => `${r.product}|${r.warehouse || ""}`;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export default function ReorderPage() {
    const { jwt } = useAuth();

    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState(null);
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState(() => new Set());
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        setErr(null);
        setResult(null);
        try {
            const res = await ReorderPoliciesEndpoints.suggestions({});
            setRows(Array.isArray(res?.data) ? res.data : []);
            setSelected(new Set());
        } catch (e) {
            console.error("Failed to load reorder suggestions", e);
            setErr("Failed to load reorder suggestions.");
        } finally {
            setLoading(false);
        }
    }, [jwt]);

    useEffect(() => { load(); }, [load]);

    const term = search.trim().toLowerCase();
    const visible = useMemo(() => (
        term ? rows.filter((r) => (r.product_name || "").toLowerCase().includes(term) || (r.sku || "").toLowerCase().includes(term)) : rows
    ), [rows, term]);

    const toggleRow = (r) => {
        const k = keyOf(r);
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(k)) next.delete(k); else next.add(k);
            return next;
        });
    };
    const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(keyOf(r)));
    const toggleAll = () => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (allVisibleSelected) visible.forEach((r) => next.delete(keyOf(r)));
            else visible.forEach((r) => next.add(keyOf(r)));
            return next;
        });
    };

    const selectedRows = useMemo(() => rows.filter((r) => selected.has(keyOf(r))), [rows, selected]);
    const purchaseSel = selectedRows.filter((r) => (r.source || "Purchase") === "Purchase");
    const mfgSel = selectedRows.filter((r) => r.source === "Manufacture");

    const generate = async (kind) => {
        const picked = kind === "purchases" ? purchaseSel : mfgSel;
        if (picked.length === 0) return;
        setBusy(true);
        setErr(null);
        setResult(null);
        try {
            const fn = kind === "purchases" ? "generatePurchases" : "generateWorkOrders";
            const res = await ReorderPoliciesEndpoints[fn]({ suggestions: picked });
            const n = res?.created ?? 0;
            const label = kind === "purchases" ? "draft purchase(s)" : "draft work-order(s)";
            setResult({ ok: true, msg: `Generated ${n} ${label} from ${picked.length} line(s).` });
            await load();
        } catch (e) {
            console.error("Generation failed", e);
            setResult({ ok: false, msg: e?.response?.data?.error?.message || `Failed to generate ${kind}.` });
        } finally {
            setBusy(false);
        }
    };

    const srcBadge = (s) => {
        const src = s || "Purchase";
        const cls = src === "Manufacture" ? "bg-primary" : src === "Transfer" ? "bg-info" : "bg-secondary";
        return <span className={`badge ${cls}`}>{src}</span>;
    };

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h3><i className="fas fa-cart-arrow-down me-2 text-danger"></i>Reorder</h3>
                    <button className="btn btn-outline-secondary btn-sm" onClick={load} disabled={loading || busy}><i className="fas fa-rotate me-1"></i>Refresh</button>
                </div>

                <p className="text-muted small mb-3">
                    Targets at or below their reorder trigger (on&nbsp;hand&nbsp;+&nbsp;on&nbsp;order&nbsp;&le;&nbsp;min&nbsp;+&nbsp;safety),
                    with a suggested quantity from each product&apos;s policy (or its legacy reorder level).
                    Select rows and generate draft purchases or work-orders.
                </p>

                <div className="d-flex gap-2 align-items-center mb-3 flex-wrap">
                    <div style={{ maxWidth: 320 }} className="flex-grow-1">
                        <input className="form-control form-control-sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="search product name or SKU…" />
                    </div>
                    <button className="btn btn-danger btn-sm" disabled={busy || purchaseSel.length === 0} onClick={() => generate("purchases")}>
                        <i className="fas fa-file-invoice-dollar me-1"></i>Generate POs{purchaseSel.length ? ` (${purchaseSel.length})` : ""}
                    </button>
                    <button className="btn btn-primary btn-sm" disabled={busy || mfgSel.length === 0} onClick={() => generate("workorders")}>
                        <i className="fas fa-industry me-1"></i>Generate WOs{mfgSel.length ? ` (${mfgSel.length})` : ""}
                    </button>
                </div>

                {err && <div className="alert alert-danger py-2">{err}</div>}
                {result && <div className={`alert py-2 ${result.ok ? "alert-success" : "alert-danger"}`}>{result.msg}</div>}

                {loading ? (
                    <div className="text-center py-5"><div className="spinner-border"></div></div>
                ) : visible.length === 0 ? (
                    <div className="alert alert-success">
                        No targets are below their reorder trigger. 🎉
                        {rows.length > 0 && term ? " (filtered — clear the search to see all)" : ""}
                    </div>
                ) : (
                    <>
                        <div className="table-responsive">
                            <table className="table table-sm table-hover align-middle">
                                <thead>
                                    <tr>
                                        <th style={{ width: 28 }}><input type="checkbox" className="form-check-input" checked={allVisibleSelected} onChange={toggleAll} /></th>
                                        <th>Product</th>
                                        <th>SKU</th>
                                        <th>Source</th>
                                        <th className="text-end">On hand</th>
                                        <th className="text-end">On order</th>
                                        <th className="text-end">Projected</th>
                                        <th className="text-end">Min</th>
                                        <th className="text-end">Suggested</th>
                                        <th>Supplier</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visible.map((r) => {
                                        const k = keyOf(r);
                                        return (
                                            <tr key={k} className={selected.has(k) ? "table-active" : ""}>
                                                <td><input type="checkbox" className="form-check-input" checked={selected.has(k)} onChange={() => toggleRow(r)} /></td>
                                                <td>
                                                    {r.product_name || <span className="text-muted">(unnamed)</span>}
                                                    {r.warehouse_name ? <span className="text-muted small"> · {r.warehouse_name}</span> : null}
                                                    {r.fallback ? <span className="badge bg-light text-dark ms-1" title="No policy — using legacy reorder_level">legacy</span> : null}
                                                </td>
                                                <td><code>{r.sku || "—"}</code></td>
                                                <td>{srcBadge(r.source)}</td>
                                                <td className="text-end">{num(r.on_hand)}</td>
                                                <td className="text-end">{num(r.on_order) || <span className="text-muted">0</span>}</td>
                                                <td className="text-end">{num(r.projected)}</td>
                                                <td className="text-end">{num(r.min_stock)}</td>
                                                <td className="text-end fw-semibold text-danger">{num(r.suggested_qty)}</td>
                                                <td className="small">{r.preferred_supplier_name || <span className="text-muted">—</span>}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div className="text-muted small">
                            {visible.length} target(s){selected.size ? ` · ${selected.size} selected` : ""}. Generation creates Draft documents for the existing approval / receiving flow.
                        </div>
                    </>
                )}
            </Layout>
        </ProtectedRoute>
    );
}
