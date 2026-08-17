import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { PayDeductionRulesEndpoints } from "@rutba/api-provider/endpoints";

const PAY_TYPES = ["monthly_salary", "piece_rate", "hybrid", "daily_wage", "contractor"];
const DEDUCTION_TYPES = ["tax", "social_security", "pension", "insurance", "union", "other"];
const CATEGORIES = ["tax", "eobi", "provident_fund", "deduction", "other"];

const EMPTY = {
    name: "", code: "", deduction_type: "tax", payer: "employee", payslip_category: "tax",
    method: "percent", base: "gross", value: 0, brackets: [],
    min_base: "", max_base: "", min_amount: "", max_amount: "",
    gl_account_key: "STATUTORY_PAYABLE", applies_to_pay_types: [], sequence: 100,
    is_active: true, effective_from: "", effective_to: "",
};

const num = (v) => (v === "" || v == null ? null : Number(v));
const money = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function DeductionRules() {
    const { jwt } = useAuth();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState("");
    const [form, setForm] = useState(EMPTY);

    useEffect(() => { if (jwt) load(); /* eslint-disable-next-line */ }, [jwt]);

    async function load() {
        setLoading(true);
        try {
            const res = await PayDeductionRulesEndpoints.list();
            setRows(res?.data || []);
        } catch (err) {
            console.error("Failed to load deduction rules", err);
        } finally {
            setLoading(false);
        }
    }

    function set(field, value) { setForm((p) => ({ ...p, [field]: value })); }
    function resetForm() { setEditingId(""); setForm(EMPTY); }

    function startEdit(r) {
        setEditingId(r.documentId);
        setForm({
            name: r.name || "", code: r.code || "",
            deduction_type: r.deduction_type || "other", payer: r.payer || "employee",
            payslip_category: r.payslip_category || "deduction", method: r.method || "percent",
            base: r.base || "gross", value: r.value ?? 0,
            brackets: (r.brackets || []).map((b) => ({ up_to: b.up_to ?? "", rate: b.rate ?? 0 })),
            min_base: r.min_base ?? "", max_base: r.max_base ?? "",
            min_amount: r.min_amount ?? "", max_amount: r.max_amount ?? "",
            gl_account_key: r.gl_account_key || "STATUTORY_PAYABLE",
            applies_to_pay_types: Array.isArray(r.applies_to_pay_types) ? r.applies_to_pay_types : [],
            sequence: r.sequence ?? 100, is_active: r.is_active !== false,
            effective_from: r.effective_from || "", effective_to: r.effective_to || "",
        });
    }

    function togglePayType(t) {
        setForm((p) => {
            const s = new Set(p.applies_to_pay_types);
            s.has(t) ? s.delete(t) : s.add(t);
            return { ...p, applies_to_pay_types: Array.from(s) };
        });
    }

    function addBracket() { setForm((p) => ({ ...p, brackets: [...p.brackets, { up_to: "", rate: 0 }] })); }
    function setBracket(i, k, v) { setForm((p) => ({ ...p, brackets: p.brackets.map((b, j) => (j === i ? { ...b, [k]: v } : b)) })); }
    function removeBracket(i) { setForm((p) => ({ ...p, brackets: p.brackets.filter((_, j) => j !== i) })); }

    async function save(e) {
        e.preventDefault();
        if (!form.name.trim()) return;
        const payload = {
            name: form.name.trim(),
            code: form.code.trim() || null,
            deduction_type: form.deduction_type,
            payer: form.payer,
            payslip_category: form.payslip_category,
            method: form.method,
            base: form.base,
            value: Number(form.value) || 0,
            brackets: form.method === "slab"
                ? form.brackets.map((b) => ({ up_to: b.up_to === "" ? null : Number(b.up_to), rate: Number(b.rate) || 0 }))
                : [],
            min_base: num(form.min_base), max_base: num(form.max_base),
            min_amount: num(form.min_amount), max_amount: num(form.max_amount),
            gl_account_key: form.gl_account_key.trim() || "STATUTORY_PAYABLE",
            applies_to_pay_types: form.applies_to_pay_types,
            sequence: Number(form.sequence) || 100,
            is_active: !!form.is_active,
            effective_from: form.effective_from || null,
            effective_to: form.effective_to || null,
        };
        setSaving(true);
        try {
            if (editingId) await PayDeductionRulesEndpoints.update(editingId, payload);
            else await PayDeductionRulesEndpoints.create(payload);
            resetForm();
            await load();
        } catch (err) {
            console.error("Failed to save deduction rule", err);
            alert("Failed to save deduction rule.");
        } finally {
            setSaving(false);
        }
    }

    async function remove(r) {
        if (!confirm(`Delete rule "${r.name}"?`)) return;
        try { await PayDeductionRulesEndpoints.del(r.documentId); await load(); }
        catch (err) { console.error("Failed to delete rule", err); alert("Failed to delete rule."); }
    }

    function describe(r) {
        if (r.method === "flat") return `Flat ${money(r.value)}`;
        if (r.method === "percent") return `${r.value}% of ${r.base === "base_salary" ? "base" : "gross"}`;
        return `Slab (${(r.brackets || []).length} brackets) on ${r.base === "base_salary" ? "base" : "gross"}`;
    }

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex align-items-center justify-content-between mb-2">
                    <h2 className="mb-0">Deduction Rules</h2>
                    <button className="btn btn-sm btn-outline-secondary" onClick={load}><i className="fas fa-rotate me-1" />Refresh</button>
                </div>
                <p className="text-muted small">Configurable statutory deductions &amp; employer contributions applied during a payroll run. Employee rules reduce net pay; employer rules add employer cost. Both credit the chosen GL liability account. No rules = no statutory deductions.</p>

                <div className="card mb-4">
                    <div className="card-header bg-light fw-semibold">{editingId ? "Edit Rule" : "New Rule"}</div>
                    <div className="card-body">
                        <form onSubmit={save}>
                            <div className="row g-2">
                                <div className="col-md-4"><label className="form-label">Name</label>
                                    <input className="form-control" value={form.name} onChange={(e) => set("name", e.target.value)} required /></div>
                                <div className="col-md-2"><label className="form-label">Code</label>
                                    <input className="form-control" value={form.code} onChange={(e) => set("code", e.target.value)} placeholder="e.g. INCOME_TAX" /></div>
                                <div className="col-md-2"><label className="form-label">Type</label>
                                    <select className="form-select" value={form.deduction_type} onChange={(e) => set("deduction_type", e.target.value)}>
                                        {DEDUCTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
                                <div className="col-md-2"><label className="form-label">Paid by</label>
                                    <select className="form-select" value={form.payer} onChange={(e) => set("payer", e.target.value)}>
                                        <option value="employee">Employee (deduction)</option>
                                        <option value="employer">Employer (contribution)</option></select></div>
                                <div className="col-md-2"><label className="form-label">Payslip category</label>
                                    <select className="form-select" value={form.payslip_category} onChange={(e) => set("payslip_category", e.target.value)}>
                                        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>

                                <div className="col-md-2"><label className="form-label">Method</label>
                                    <select className="form-select" value={form.method} onChange={(e) => set("method", e.target.value)}>
                                        <option value="flat">Flat amount</option>
                                        <option value="percent">Percent</option>
                                        <option value="slab">Slab (progressive)</option></select></div>
                                {form.method !== "flat" && (
                                    <div className="col-md-2"><label className="form-label">Base</label>
                                        <select className="form-select" value={form.base} onChange={(e) => set("base", e.target.value)}>
                                            <option value="gross">Gross earnings</option>
                                            <option value="base_salary">Base salary</option></select></div>
                                )}
                                {form.method !== "slab" && (
                                    <div className="col-md-2"><label className="form-label">{form.method === "percent" ? "Rate (%)" : "Amount"}</label>
                                        <input type="number" step="0.01" className="form-control" value={form.value} onChange={(e) => set("value", e.target.value)} /></div>
                                )}
                                <div className="col-md-2"><label className="form-label">GL account key</label>
                                    <input className="form-control" value={form.gl_account_key} onChange={(e) => set("gl_account_key", e.target.value)} /></div>
                                <div className="col-md-2"><label className="form-label">Sequence</label>
                                    <input type="number" className="form-control" value={form.sequence} onChange={(e) => set("sequence", e.target.value)} /></div>
                                <div className="col-md-2 d-flex align-items-end"><div className="form-check">
                                    <input className="form-check-input" type="checkbox" id="active" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} />
                                    <label className="form-check-label" htmlFor="active">Active</label></div></div>

                                {form.method === "slab" && (
                                    <div className="col-12">
                                        <label className="form-label d-block">Brackets (marginal — leave “up to” empty for the top bracket)</label>
                                        {form.brackets.map((b, i) => (
                                            <div className="row g-2 mb-1 align-items-center" key={i}>
                                                <div className="col-md-3"><input type="number" step="0.01" className="form-control form-control-sm" placeholder="up to" value={b.up_to} onChange={(e) => setBracket(i, "up_to", e.target.value)} /></div>
                                                <div className="col-md-2"><input type="number" step="0.01" className="form-control form-control-sm" placeholder="rate %" value={b.rate} onChange={(e) => setBracket(i, "rate", e.target.value)} /></div>
                                                <div className="col-md-1"><button type="button" className="btn btn-sm btn-outline-danger" onClick={() => removeBracket(i)}>×</button></div>
                                            </div>
                                        ))}
                                        <button type="button" className="btn btn-sm btn-outline-secondary mt-1" onClick={addBracket}>+ Bracket</button>
                                    </div>
                                )}

                                <div className="col-md-3"><label className="form-label">Min base</label>
                                    <input type="number" step="0.01" className="form-control" value={form.min_base} onChange={(e) => set("min_base", e.target.value)} /></div>
                                <div className="col-md-3"><label className="form-label">Max base (cap)</label>
                                    <input type="number" step="0.01" className="form-control" value={form.max_base} onChange={(e) => set("max_base", e.target.value)} /></div>
                                <div className="col-md-3"><label className="form-label">Min amount</label>
                                    <input type="number" step="0.01" className="form-control" value={form.min_amount} onChange={(e) => set("min_amount", e.target.value)} /></div>
                                <div className="col-md-3"><label className="form-label">Max amount</label>
                                    <input type="number" step="0.01" className="form-control" value={form.max_amount} onChange={(e) => set("max_amount", e.target.value)} /></div>

                                <div className="col-md-3"><label className="form-label">Effective from</label>
                                    <input type="date" className="form-control" value={form.effective_from} onChange={(e) => set("effective_from", e.target.value)} /></div>
                                <div className="col-md-3"><label className="form-label">Effective to</label>
                                    <input type="date" className="form-control" value={form.effective_to} onChange={(e) => set("effective_to", e.target.value)} /></div>
                                <div className="col-md-6"><label className="form-label d-block">Applies to pay types <span className="text-muted">(none = all)</span></label>
                                    {PAY_TYPES.map((t) => (
                                        <div className="form-check form-check-inline" key={t}>
                                            <input className="form-check-input" type="checkbox" id={`pt-${t}`} checked={form.applies_to_pay_types.includes(t)} onChange={() => togglePayType(t)} />
                                            <label className="form-check-label small" htmlFor={`pt-${t}`}>{t}</label>
                                        </div>
                                    ))}</div>
                            </div>
                            <div className="d-flex gap-2 mt-3">
                                <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Saving…" : editingId ? "Update Rule" : "Create Rule"}</button>
                                {editingId && <button type="button" className="btn btn-outline-secondary" onClick={resetForm}>Cancel</button>}
                            </div>
                        </form>
                    </div>
                </div>

                {loading && <p>Loading rules…</p>}
                {!loading && rows.length === 0 && <div className="alert alert-info">No deduction rules configured. Payroll runs will compute no statutory deductions until you add some.</div>}
                {!loading && rows.length > 0 && (
                    <div className="table-responsive">
                        <table className="table table-striped table-hover align-middle">
                            <thead className="table-dark"><tr><th>#</th><th>Name</th><th>Payer</th><th>Formula</th><th>GL key</th><th>Pay types</th><th>Active</th><th></th></tr></thead>
                            <tbody>
                                {rows.map((r) => (
                                    <tr key={r.id}>
                                        <td>{r.sequence ?? "—"}</td>
                                        <td>{r.name}{r.code ? <span className="text-muted small d-block">{r.code}</span> : null}</td>
                                        <td><span className={`badge bg-${r.payer === "employer" ? "info" : "secondary"}`}>{r.payer}</span></td>
                                        <td className="small">{describe(r)}</td>
                                        <td className="small"><code>{r.gl_account_key || "STATUTORY_PAYABLE"}</code></td>
                                        <td className="small">{(r.applies_to_pay_types && r.applies_to_pay_types.length) ? r.applies_to_pay_types.join(", ") : "all"}</td>
                                        <td>{r.is_active !== false ? <span className="badge bg-success">Yes</span> : <span className="badge bg-secondary">No</span>}</td>
                                        <td className="text-nowrap">
                                            <button className="btn btn-sm btn-outline-primary me-1" onClick={() => startEdit(r)}>Edit</button>
                                            <button className="btn btn-sm btn-outline-danger" onClick={() => remove(r)}>Delete</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() { return { props: {} }; }
