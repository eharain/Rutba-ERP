import React, { useState, useEffect, useCallback, useMemo } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { MarketplaceAccountsEndpoints, MarketplacePriceRulesEndpoints } from "@rutba/api-provider/endpoints";
import { useToast } from "../components/Toast";
import { appGet } from "../components/appClient";

const EMPTY = { category: "", adjust_pct: "", adjust_fixed: "", priority: 0, note: "" };

export default function PricingPage() {
    const { jwt } = useAuth();
    const { toast, ToastContainer } = useToast();

    const [accounts, setAccounts] = useState([]);
    const [accountId, setAccountId] = useState("");
    const [categories, setCategories] = useState([]);
    const [rules, setRules] = useState([]);
    const [form, setForm] = useState({ ...EMPTY });
    const [loading, setLoading] = useState(false);

    const account = useMemo(() => accounts.find((a) => a.documentId === accountId), [accounts, accountId]);
    const catName = useMemo(() => Object.fromEntries(categories.map((c) => [c.documentId, c.name])), [categories]);

    useEffect(() => {
        if (!jwt) return;
        MarketplaceAccountsEndpoints.list({ sort: ["createdAt:desc"] })
            .then((res) => { const l = res.data || []; setAccounts(l); if (l[0]) setAccountId(l[0].documentId); })
            .catch(() => toast("Failed to load accounts.", "danger"));
        appGet("/api/internal/entities?kind=category", jwt)
            .then((r) => setCategories(r.items || []))
            .catch(() => {});
    }, [jwt]);

    const loadRules = useCallback(async () => {
        if (!jwt || !account) { setRules([]); return; }
        setLoading(true);
        try {
            const res = await MarketplacePriceRulesEndpoints.list({
                filters: { marketplace_account: { documentId: { $eq: account.documentId } } },
                populate: { category: { fields: ["documentId", "name"] } },
                sort: ["priority:desc"],
            });
            setRules(res.data || []);
        } catch (e) {
            toast("Failed to load price rules.", "danger");
        } finally {
            setLoading(false);
        }
    }, [jwt, account]);

    useEffect(() => { loadRules(); }, [loadRules]);

    const addRule = async () => {
        if (!form.category) { toast("Pick a category.", "warning"); return; }
        const pct = form.adjust_pct === "" ? 0 : Number(form.adjust_pct);
        const fixed = form.adjust_fixed === "" ? 0 : Number(form.adjust_fixed);
        if (!Number.isFinite(pct) || !Number.isFinite(fixed)) { toast("% and fixed must be numbers.", "warning"); return; }
        try {
            await MarketplacePriceRulesEndpoints.create({
                data: {
                    marketplace_account: account.documentId,
                    platform: account.platform,
                    category: { documentId: form.category },
                    adjust_pct: pct,
                    adjust_fixed: fixed,
                    priority: Number(form.priority) || 0,
                    is_active: true,
                    note: form.note || null,
                },
            });
            setForm({ ...EMPTY });
            toast("Rule added.", "success");
            await loadRules();
        } catch (e) {
            toast(`Save failed: ${e.message}`, "danger");
        }
    };

    const patchRule = async (rule, data) => {
        try {
            await MarketplacePriceRulesEndpoints.update(rule.documentId, { data });
            await loadRules();
        } catch (e) {
            toast(`Update failed: ${e.message}`, "danger");
        }
    };

    const delRule = async (rule) => {
        if (!confirm("Delete this price rule?")) return;
        try {
            await MarketplacePriceRulesEndpoints.del(rule.documentId);
            toast("Rule deleted.", "success");
            await loadRules();
        } catch (e) {
            toast(`Delete failed: ${e.message}`, "danger");
        }
    };

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                    <h3 className="mb-0"><i className="fas fa-sliders me-2"></i>Pricing Rules</h3>
                    <div className="d-flex align-items-center gap-2">
                        <label className="small text-muted mb-0">Account</label>
                        <select className="form-select form-select-sm" style={{ width: 240 }} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                            {accounts.length === 0 && <option value="">No accounts</option>}
                            {accounts.map((a) => <option key={a.documentId} value={a.documentId}>{a.account_name} ({a.platform})</option>)}
                        </select>
                    </div>
                </div>

                {!account ? (
                    <div className="alert alert-info">Add a marketplace account first.</div>
                ) : (
                    <>
                        <p className="text-muted small">
                            Per-category price adjustment for {account.account_name}. Applied as <code>price × (1 + %/100) + fixed</code> to
                            both the regular and sale price. Use + to raise (e.g. cover this platform's shipping on a category), − to lower.
                            A product's per-product % (Listings page) overrides its category rule; the account default ({account.price_adjust_pct || 0}%) applies where no rule matches.
                        </p>

                        <div className="card mb-3">
                            <div className="card-body py-2">
                                <div className="row g-2 align-items-end">
                                    <div className="col-md-4">
                                        <label className="form-label small mb-0">Category</label>
                                        <select className="form-select form-select-sm" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                                            <option value="">Select…</option>
                                            {categories.map((c) => <option key={c.documentId} value={c.documentId}>{c.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="col-md-2">
                                        <label className="form-label small mb-0">Adjust %</label>
                                        <input className="form-control form-control-sm text-end" inputMode="decimal" placeholder="0" value={form.adjust_pct} onChange={(e) => setForm((f) => ({ ...f, adjust_pct: e.target.value }))} />
                                    </div>
                                    <div className="col-md-2">
                                        <label className="form-label small mb-0">Fixed</label>
                                        <input className="form-control form-control-sm text-end" inputMode="decimal" placeholder="0" value={form.adjust_fixed} onChange={(e) => setForm((f) => ({ ...f, adjust_fixed: e.target.value }))} />
                                    </div>
                                    <div className="col-md-2">
                                        <label className="form-label small mb-0">Priority</label>
                                        <input className="form-control form-control-sm text-end" inputMode="numeric" placeholder="0" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} />
                                    </div>
                                    <div className="col-md-2">
                                        <button className="btn btn-primary btn-sm w-100" onClick={addRule}><i className="fas fa-plus me-1"></i>Add</button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {loading ? (
                            <div className="text-center py-4"><div className="spinner-border"></div></div>
                        ) : rules.length === 0 ? (
                            <div className="alert alert-warning">No price rules yet — products use the account default ({account.price_adjust_pct || 0}%).</div>
                        ) : (
                            <div className="table-responsive">
                                <table className="table table-sm align-middle">
                                    <thead>
                                        <tr><th>Category</th><th className="text-end">Adjust %</th><th className="text-end">Fixed</th><th className="text-end">Priority</th><th>Active</th><th>Note</th><th></th></tr>
                                    </thead>
                                    <tbody>
                                        {rules.map((r) => (
                                            <tr key={r.documentId} className={r.is_active === false ? "text-muted" : ""}>
                                                <td>{r.category?.name || catName[r.category?.documentId] || "—"}</td>
                                                <td className="text-end">{Number(r.adjust_pct) || 0}%</td>
                                                <td className="text-end">{Number(r.adjust_fixed) || 0}</td>
                                                <td className="text-end">{Number(r.priority) || 0}</td>
                                                <td>
                                                    <input type="checkbox" className="form-check-input" checked={r.is_active !== false} onChange={(e) => patchRule(r, { is_active: e.target.checked })} />
                                                </td>
                                                <td className="small">{r.note || ""}</td>
                                                <td><button className="btn btn-sm btn-outline-danger" onClick={() => delRule(r)}><i className="fas fa-trash"></i></button></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}
            </Layout>
        </ProtectedRoute>
    );
}
