import React, { useState, useEffect, useCallback, useMemo } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { MarketplaceAccountsEndpoints, MarketplaceListingsEndpoints } from "@rutba/api-provider/endpoints";
import { useToast } from "../components/Toast";
import { appGet, appPost } from "../components/appClient";

const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
function adjusted(base, pct) {
    const b = Number(base) || 0;
    if (!b) return 0;
    return Math.round(b * (1 + (Number(pct) || 0) / 100) * 100) / 100;
}

export default function ListingsPage() {
    const { jwt } = useAuth();
    const { toast, ToastContainer } = useToast();

    const [accounts, setAccounts] = useState([]);
    const [accountId, setAccountId] = useState("");
    const [products, setProducts] = useState([]);
    const [pagination, setPagination] = useState({ page: 1, pageCount: 1 });
    const [byProduct, setByProduct] = useState({}); // product documentId → listing row
    const [pctInputs, setPctInputs] = useState({}); // product documentId → string (override %)
    const [q, setQ] = useState("");
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [pushing, setPushing] = useState(false);

    const account = useMemo(() => accounts.find((a) => a.documentId === accountId), [accounts, accountId]);
    const accountPct = num(account?.price_adjust_pct) || 0;

    useEffect(() => {
        if (!jwt) return;
        MarketplaceAccountsEndpoints.list({ sort: ["createdAt:desc"] })
            .then((res) => { const l = res.data || []; setAccounts(l); if (l[0]) setAccountId(l[0].documentId); })
            .catch(() => toast("Failed to load accounts.", "danger"));
    }, [jwt]);

    // load all listings for the account (mapped by product)
    const loadListings = useCallback(async () => {
        if (!jwt || !account) { setByProduct({}); return; }
        try {
            const res = await MarketplaceListingsEndpoints.list({
                filters: { marketplace_account: { documentId: { $eq: account.documentId } } },
                populate: { product: { fields: ["documentId"] } },
                pageSize: 1000,
            });
            const map = {};
            for (const row of res.data || []) {
                const pid = row.product?.documentId;
                if (pid) map[pid] = row;
            }
            setByProduct(map);
        } catch (e) {
            toast("Failed to load listings.", "danger");
        }
    }, [jwt, account]);

    useEffect(() => { loadListings(); }, [loadListings]);

    // load products page
    const loadProducts = useCallback(async () => {
        if (!jwt || !account) return;
        setLoading(true);
        try {
            const res = await appGet(`/api/internal/products?page=${page}&pageSize=50&q=${encodeURIComponent(q)}`, jwt);
            setProducts(res.items || []);
            setPagination(res.pagination || { page, pageCount: 1 });
        } catch (e) {
            toast(`Failed to load products: ${e.message}`, "danger");
        } finally {
            setLoading(false);
        }
    }, [jwt, account, page, q]);

    useEffect(() => { loadProducts(); }, [loadProducts]);

    const upsertListing = async (product, patch) => {
        const existing = byProduct[product.documentId];
        try {
            let row;
            if (existing) {
                const res = await MarketplaceListingsEndpoints.update(existing.documentId, { data: patch });
                row = { ...existing, ...patch, ...(res?.data || {}) };
            } else {
                const data = {
                    marketplace_account: account.documentId,
                    platform: account.platform,
                    product: { documentId: product.documentId },
                    product_sku: product.sku || null,
                    product_name: product.name || null,
                    selected: false,
                    status: "draft",
                    ...patch,
                };
                const res = await MarketplaceListingsEndpoints.create({ data });
                row = res?.data || { ...data, documentId: res?.data?.documentId };
                row.product = { documentId: product.documentId };
            }
            setByProduct((p) => ({ ...p, [product.documentId]: row }));
            return row;
        } catch (e) {
            toast(`Save failed: ${e.message}`, "danger");
        }
    };

    const toggleSelect = (product, checked) => {
        if (!checked && !byProduct[product.documentId]) return; // nothing to do
        upsertListing(product, { selected: checked });
    };

    const commitPct = (product, value) => {
        const v = String(value ?? "").trim();
        const pct = v === "" ? null : Number(v);
        if (v !== "" && !Number.isFinite(pct)) { toast("Enter a number, e.g. 10 or -5.", "warning"); return; }
        upsertListing(product, { price_adjust_pct: pct });
    };

    const pushSelected = async () => {
        setPushing(true);
        try {
            const res = await appPost(`/api/accounts/${account.documentId}/sync-inventory`, jwt);
            toast(`Push: ${res.updated || 0} updated, ${res.skipped || 0} skipped, ${res.failed || 0} failed`, res.failed > 0 ? "warning" : "success");
            await loadListings();
        } catch (e) {
            toast(`Push failed: ${e.message}`, "danger");
        } finally {
            setPushing(false);
        }
    };

    const selectedCount = Object.values(byProduct).filter((l) => l.selected).length;

    return (
        <ProtectedRoute>
            <Layout fullWidth>
                <ToastContainer />
                <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                    <h3 className="mb-0"><i className="fas fa-tags me-2"></i>Listings</h3>
                    <div className="d-flex align-items-center gap-2">
                        <label className="small text-muted mb-0">Account</label>
                        <select className="form-select form-select-sm" style={{ width: 240 }} value={accountId} onChange={(e) => { setAccountId(e.target.value); setPage(1); }}>
                            {accounts.length === 0 && <option value="">No accounts</option>}
                            {accounts.map((a) => <option key={a.documentId} value={a.documentId}>{a.account_name} ({a.platform})</option>)}
                        </select>
                    </div>
                </div>

                {!account ? (
                    <div className="alert alert-info">Add a marketplace account first.</div>
                ) : (
                    <>
                        <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
                            <div className="d-flex align-items-center gap-2">
                                <input className="form-control form-control-sm" style={{ width: 280 }} placeholder="Search name or SKU…"
                                    defaultValue={q} onKeyDown={(e) => { if (e.key === "Enter") { setPage(1); setQ(e.target.value); } }} />
                                <span className="badge bg-light text-dark border">Account default: {accountPct}%</span>
                                <span className="badge bg-secondary">{selectedCount} selected</span>
                            </div>
                            <button className="btn btn-success btn-sm" disabled={pushing || selectedCount === 0} onClick={pushSelected}>
                                {pushing ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="fas fa-cloud-arrow-up me-1"></i>}
                                Push selected ({selectedCount})
                            </button>
                        </div>
                        <p className="text-muted small">Price % raises (+) or lowers (−) the pushed price vs your selling price. Per-product value overrides the account default. Edit the account default on the Accounts page.</p>

                        {loading ? (
                            <div className="text-center py-4"><div className="spinner-border"></div></div>
                        ) : products.length === 0 ? (
                            <div className="alert alert-warning">No products found.</div>
                        ) : (
                            <div className="table-responsive">
                                <table className="table table-sm table-hover align-middle">
                                    <thead>
                                        <tr>
                                            <th style={{ width: 70 }}>Publish</th>
                                            <th>Product</th>
                                            <th>SKU</th>
                                            <th className="text-end">Price</th>
                                            <th className="text-end">Stock</th>
                                            <th style={{ width: 110 }}>Price %</th>
                                            <th className="text-end">Marketplace price</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {products.map((p) => {
                                            const listing = byProduct[p.documentId];
                                            const override = pctInputs[p.documentId] !== undefined
                                                ? pctInputs[p.documentId]
                                                : (listing?.price_adjust_pct ?? "");
                                            const effPct = override === "" || override === null ? accountPct : Number(override) || 0;
                                            const mkPrice = adjusted(p.selling_price, effPct);
                                            return (
                                                <tr key={p.documentId} className={listing?.selected ? "table-success" : ""}>
                                                    <td className="text-center">
                                                        <input type="checkbox" className="form-check-input" checked={!!listing?.selected} onChange={(e) => toggleSelect(p, e.target.checked)} />
                                                    </td>
                                                    <td>{p.name}{p.is_active === false ? <span className="badge bg-secondary ms-1">inactive</span> : null}</td>
                                                    <td><code>{p.sku || "—"}</code></td>
                                                    <td className="text-end">{Number(p.selling_price) || 0}</td>
                                                    <td className="text-end">{Number(p.stock_quantity) || 0}</td>
                                                    <td>
                                                        <input className="form-control form-control-sm text-end" inputMode="decimal"
                                                            placeholder={`${accountPct}`}
                                                            value={override}
                                                            onChange={(e) => setPctInputs((s) => ({ ...s, [p.documentId]: e.target.value }))}
                                                            onBlur={(e) => commitPct(p, e.target.value)} />
                                                    </td>
                                                    <td className="text-end fw-semibold">{mkPrice}</td>
                                                    <td>
                                                        {!listing ? <span className="text-muted small">—</span>
                                                            : listing.status === "listed" ? <span className="badge bg-success" title={listing.last_pushed_at ? new Date(listing.last_pushed_at).toLocaleString() : ""}>listed @ {listing.listed_price}</span>
                                                            : listing.status === "error" ? <span className="badge bg-danger" title={listing.push_error || ""}>error</span>
                                                            : <span className="badge bg-light text-dark border">{listing.status}</span>}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {pagination.pageCount > 1 && (
                            <div className="d-flex justify-content-center align-items-center gap-2">
                                <button className="btn btn-sm btn-outline-secondary" disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>Prev</button>
                                <span className="small">Page {pagination.page} / {pagination.pageCount}</span>
                                <button className="btn btn-sm btn-outline-secondary" disabled={page >= pagination.pageCount} onClick={() => setPage((n) => n + 1)}>Next</button>
                            </div>
                        )}
                    </>
                )}
            </Layout>
        </ProtectedRoute>
    );
}
