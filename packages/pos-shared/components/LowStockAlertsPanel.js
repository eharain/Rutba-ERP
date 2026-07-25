import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { StockAlertsEndpoints, BranchesEndpoints } from "@rutba/api-provider/endpoints";
import { ProductFilter } from "./filter/product-filter";
import { useProductLookups } from "../hooks/useProductLookups";

/**
 * LowStockAlertsPanel — the persisted low-stock alert queue, shared across apps.
 * Alerts are upserted daily by the reorder suggestion engine (cron
 * lowStockAlertSweep) and can be acknowledged / dismissed here, or re-scanned on
 * demand ("Run scan now"). Filter by status / severity / branch and product
 * taxonomy (brand / category / supplier / search). Driven by /stock-alerts.
 */

const PAGE_SIZE = 50;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const SEVERITY_BADGE = {
    Critical: "bg-danger",
    High: "bg-warning text-dark",
    Medium: "bg-info text-dark",
    Low: "bg-secondary",
};
const STATUS_BADGE = {
    Open: "bg-danger",
    Acknowledged: "bg-warning text-dark",
    Resolved: "bg-success",
    Dismissed: "bg-secondary",
};

export default function LowStockAlertsPanel() {
    const { jwt } = useAuth();
    const { brands, categories, suppliers } = useProductLookups({ skip: new Set(["termTypes", "purchases"]) });

    const [rows, setRows] = useState([]);
    const [meta, setMeta] = useState(null);
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    const [result, setResult] = useState(null);

    const [statusFilter, setStatusFilter] = useState("Open");
    const [severityFilter, setSeverityFilter] = useState("");
    const [branchDocId, setBranchDocId] = useState("");
    const [selectedBrand, setSelectedBrand] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("");
    const [selectedSupplier, setSelectedSupplier] = useState("");
    const [searchText, setSearchText] = useState("");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);

    useEffect(() => {
        const t = setTimeout(() => setSearch(searchText.trim()), 400);
        return () => clearTimeout(t);
    }, [searchText]);

    const loadBranches = useCallback(async () => {
        if (!jwt) return;
        try {
            const res = await BranchesEndpoints.list({ pageSize: 200, sort: ["name:asc"] });
            setBranches(res?.data || []);
        } catch (e) { console.error("Failed to load branches", e); }
    }, [jwt]);

    const load = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        setErr(null);
        try {
            const res = await StockAlertsEndpoints.list(page, PAGE_SIZE, {
                ...(statusFilter ? { statusFilter } : {}),
                ...(severityFilter ? { severityFilter } : {}),
                ...(branchDocId ? { branchDocId } : {}),
                ...(selectedCategory ? { categoryDocId: selectedCategory } : {}),
                ...(selectedBrand ? { brandDocId: selectedBrand } : {}),
                ...(selectedSupplier ? { supplierDocId: selectedSupplier } : {}),
                ...(search ? { search } : {}),
            });
            setRows(res?.data || []);
            setMeta(res?.meta?.pagination || null);
        } catch (e) {
            console.error("Failed to load alerts", e);
            setErr("Failed to load stock alerts.");
        } finally {
            setLoading(false);
        }
    }, [jwt, page, statusFilter, severityFilter, branchDocId, selectedCategory, selectedBrand, selectedSupplier, search]);

    useEffect(() => { loadBranches(); }, [loadBranches]);

    // Single fetch driver — filter change while not on page 1 jumps to page 1 first
    // and skips the stale-page fetch, so exactly one request runs per change.
    const filtersKey = [statusFilter, severityFilter, branchDocId, selectedCategory, selectedBrand, selectedSupplier, search].join("|");
    const lastFetchedKey = useRef(null);
    useEffect(() => {
        if (lastFetchedKey.current !== null && lastFetchedKey.current !== filtersKey && page !== 1) {
            setPage(1);
            return;
        }
        lastFetchedKey.current = filtersKey;
        load();
    }, [load, filtersKey, page]); // eslint-disable-line react-hooks/exhaustive-deps

    const runScan = async () => {
        setBusy(true); setErr(null); setResult(null);
        try {
            const res = await StockAlertsEndpoints.runNow();
            setResult({ ok: true, msg: `Scan complete — checked ${num(res?.checked)}, opened ${num(res?.opened)}, updated ${num(res?.updated)}, resolved ${num(res?.resolved)}.` });
            await load();
        } catch (e) {
            console.error("Scan failed", e);
            setResult({ ok: false, msg: e?.response?.data?.error?.message || "Failed to run the low-stock scan." });
        } finally {
            setBusy(false);
        }
    };

    const act = async (documentId, kind) => {
        setBusy(true); setErr(null);
        try {
            if (kind === "acknowledge") await StockAlertsEndpoints.acknowledge(documentId);
            else await StockAlertsEndpoints.dismiss(documentId);
            await load();
        } catch (e) {
            console.error(`${kind} failed`, e);
            setErr(e?.response?.data?.error?.message || `Failed to ${kind} the alert.`);
        } finally {
            setBusy(false);
        }
    };

    const branchOptions = branches.map((b) => ({ value: b.documentId, label: b.name }));
    const extra = [
        { key: "status", type: "select", label: "Status", value: statusFilter, onChange: setStatusFilter, placeholder: "All statuses", options: ["Open", "Acknowledged", "Resolved", "Dismissed"].map((s) => ({ value: s, label: s })) },
        { key: "severity", type: "select", label: "Severity", value: severityFilter, onChange: setSeverityFilter, placeholder: "All severities", options: ["Critical", "High", "Medium", "Low"].map((s) => ({ value: s, label: s })) },
        { key: "branch", type: "select", label: "Branch", value: branchDocId, onChange: setBranchDocId, placeholder: "All Branches", options: branchOptions },
    ];

    return (
        <>
            <div className="d-flex justify-content-between align-items-center mb-3">
                <h3><i className="fas fa-bell me-2 text-danger"></i>Low-Stock Alerts</h3>
                <div className="d-flex gap-2">
                    <button className="btn btn-outline-secondary btn-sm" onClick={load} disabled={loading || busy}><i className="fas fa-rotate me-1"></i>Refresh</button>
                    <button className="btn btn-danger btn-sm" onClick={runScan} disabled={loading || busy}><i className="fas fa-magnifying-glass-chart me-1"></i>Run scan now</button>
                </div>
            </div>

            <p className="text-muted small mb-3">
                Persisted low-stock alerts from the reorder engine (products at or below their reorder
                trigger). Refreshed automatically each day; acknowledge one you&apos;re handling, or dismiss
                one you want to ignore (it won&apos;t re-open while still low).
            </p>

            <div className="mb-3">
                <ProductFilter
                    brands={brands}
                    categories={categories}
                    suppliers={suppliers}
                    selectedBrand={selectedBrand}
                    selectedCategory={selectedCategory}
                    selectedSupplier={selectedSupplier}
                    searchText={searchText}
                    onBrandChange={setSelectedBrand}
                    onCategoryChange={setSelectedCategory}
                    onSupplierChange={setSelectedSupplier}
                    onSearchTextChange={setSearchText}
                    searchPlaceholder="Search product name or SKU…"
                    hide={new Set(["term", "purchase"])}
                    extra={extra}
                />
            </div>

            {err && <div className="alert alert-danger py-2">{err}</div>}
            {result && <div className={`alert py-2 ${result.ok ? "alert-success" : "alert-danger"}`}>{result.msg}</div>}

            {loading ? (
                <div className="text-center py-5"><div className="spinner-border"></div></div>
            ) : rows.length === 0 ? (
                <div className="alert alert-success">No {statusFilter ? statusFilter.toLowerCase() : ""} alerts match. 🎉</div>
            ) : (
                <>
                    <div className="table-responsive">
                        <table className="table table-sm table-hover align-middle">
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th>SKU</th>
                                    <th>Branch</th>
                                    <th>Severity</th>
                                    <th className="text-end">On hand</th>
                                    <th className="text-end">On order</th>
                                    <th className="text-end">Deficit</th>
                                    <th className="text-end">Suggested</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((a) => (
                                    <tr key={a.documentId || a.id}>
                                        <td>{a.product?.name || <span className="text-muted">(unnamed)</span>}</td>
                                        <td><code>{a.product?.sku || "—"}</code></td>
                                        <td>{a.branch?.name || <span className="text-muted">product-wide</span>}</td>
                                        <td><span className={`badge ${SEVERITY_BADGE[a.severity] || "bg-secondary"}`}>{a.severity}</span></td>
                                        <td className="text-end">{num(a.on_hand)}</td>
                                        <td className="text-end">{num(a.on_order) || <span className="text-muted">0</span>}</td>
                                        <td className="text-end">{num(a.deficit)}</td>
                                        <td className="text-end fw-semibold text-danger">{num(a.suggested_qty)}</td>
                                        <td><span className={`badge ${STATUS_BADGE[a.status] || "bg-secondary"}`}>{a.status}</span></td>
                                        <td>
                                            {["Open", "Acknowledged"].includes(a.status) && (
                                                <div className="btn-group btn-group-sm">
                                                    {a.status === "Open" && (
                                                        <button className="btn btn-outline-primary" disabled={busy} onClick={() => act(a.documentId, "acknowledge")} title="Acknowledge">
                                                            <i className="fas fa-check"></i>
                                                        </button>
                                                    )}
                                                    <button className="btn btn-outline-secondary" disabled={busy} onClick={() => act(a.documentId, "dismiss")} title="Dismiss">
                                                        <i className="fas fa-xmark"></i>
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {meta && (
                        <div className="d-flex justify-content-between align-items-center">
                            <span className="text-muted small">Page {meta.page} of {meta.pageCount} · {meta.total} alert(s)</span>
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
        </>
    );
}
