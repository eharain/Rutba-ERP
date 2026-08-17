import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { MfgJobWorksEndpoints, SuppliersEndpoints, BranchesEndpoints, StockItemsEndpoints } from "@rutba/api-provider/endpoints";

const STATUS_BADGE = {
    Draft: "bg-secondary",
    Dispatched: "bg-warning text-dark",
    PartiallyReturned: "bg-info text-dark",
    Returned: "bg-primary",
    Closed: "bg-success",
    Cancelled: "bg-light text-muted border",
};

function unitCount(jw) {
    const si = jw.stock_items;
    if (!si) return 0;
    if (Array.isArray(si)) return si.length;
    if (typeof si.count === "number") return si.count;
    return 0;
}

const EMPTY_FORM = { vendor: "", branch: "", name: "", service: "Stitching", rate: "", expected: "", notes: "" };

export default function JobWorkPage() {
    const { jwt } = useAuth();
    const router = useRouter();
    const statusFilter = typeof router.query.status === "string" ? router.query.status : "";

    const [rows, setRows] = useState([]);
    const [meta, setMeta] = useState(null);
    const [vendors, setVendors] = useState([]);
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState(null);
    const [busy, setBusy] = useState(null);
    const [page, setPage] = useState(1);

    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ ...EMPTY_FORM });
    const [units, setUnits] = useState([]); // [{ documentId, barcode, product, status, cost }]
    const [barcode, setBarcode] = useState("");
    const [adding, setAdding] = useState(false);
    const [saving, setSaving] = useState(false);

    const notify = (text, variant = "success") => setMsg({ text, variant });

    const loadMasters = useCallback(async () => {
        if (!jwt) return;
        try {
            const [sup, br] = await Promise.all([
                SuppliersEndpoints.list({ pageSize: 200, sort: ["name:asc"], populate: {} }),
                BranchesEndpoints.list({ pageSize: 200, sort: ["name:asc"] }),
            ]);
            setVendors(sup?.data || []);
            setBranches(br?.data || []);
        } catch (e) { console.error("masters", e); }
    }, [jwt]);

    const loadRows = useCallback(async () => {
        if (!jwt || !router.isReady) return;
        setLoading(true);
        try {
            const res = await MfgJobWorksEndpoints.list(page, 50, {
                ...(statusFilter ? { statusFilter } : {}),
                sort: ["createdAt:desc"],
            });
            setRows(res?.data || []);
            setMeta(res?.meta?.pagination || null);
        } catch (e) {
            console.error("job works", e);
            notify("Failed to load job work orders.", "danger");
        } finally {
            setLoading(false);
        }
    }, [jwt, page, statusFilter, router.isReady]);

    useEffect(() => { loadMasters(); }, [loadMasters]);
    useEffect(() => { loadRows(); }, [loadRows]);
    useEffect(() => { setPage(1); }, [statusFilter]);

    const changeForm = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));
    const openCreate = () => { setForm({ ...EMPTY_FORM }); setUnits([]); setBarcode(""); setShowForm(true); };

    const addUnit = async () => {
        const code = barcode.trim();
        if (!code) return;
        if (units.some((u) => u.barcode === code)) { notify(`Already added: ${code}`, "warning"); setBarcode(""); return; }
        setAdding(true);
        try {
            const res = await StockItemsEndpoints.listByBarcode(code);
            const item = (res?.data || [])[0];
            if (!item) { notify(`No stock item with barcode ${code}`, "warning"); return; }
            setUnits((prev) => [...prev, {
                documentId: item.documentId,
                barcode: item.barcode || code,
                product: item.product?.name || item.name || "(unnamed)",
                status: item.status,
                cost: item.cost_price,
            }]);
            setBarcode("");
        } catch (e) {
            console.error("resolve barcode", e);
            notify("Failed to resolve barcode.", "danger");
        } finally {
            setAdding(false);
        }
    };

    const removeUnit = (documentId) => setUnits((prev) => prev.filter((u) => u.documentId !== documentId));

    const submitCreate = async (e) => {
        e.preventDefault();
        if (!form.vendor) { notify("Pick the vendor (third-party stitcher).", "warning"); return; }
        if (units.length === 0) { notify("Add at least one unit (scan a barcode).", "warning"); return; }
        setSaving(true);
        try {
            const data = {
                vendor: form.vendor,
                branch: form.branch || null,
                name: form.name || null,
                service_description: form.service || null,
                agreed_rate: form.rate === "" ? null : Number(form.rate),
                expected_return_date: form.expected || null,
                notes: form.notes || null,
                status: "Draft",
                stock_items: units.map((u) => u.documentId),
            };
            await MfgJobWorksEndpoints.create({ data });
            notify("Job work created (Draft). Dispatch it when the units go out.");
            setShowForm(false);
            await loadRows();
        } catch (err) {
            console.error("create job work", err);
            notify(err?.response?.data?.error?.message || "Failed to create job work.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const doAction = async (jw, action, confirmText) => {
        if (confirmText && !window.confirm(confirmText)) return;
        setBusy(`${jw.documentId}:${action}`);
        try {
            const res = await MfgJobWorksEndpoints[action](jw.documentId);
            notify(`${jw.jw_number}: ${action} ok${res?.status ? ` → ${res.status}` : ""}.`);
            await loadRows();
        } catch (err) {
            console.error(`${action} job work`, err);
            notify(err?.response?.data?.error?.message || `Failed to ${action}.`, "danger");
        } finally {
            setBusy(null);
        }
    };

    const delRow = async (jw) => {
        if (!window.confirm(`Delete job work ${jw.jw_number}? (Only Draft job works should be deleted.)`)) return;
        setBusy(`${jw.documentId}:del`);
        try {
            await MfgJobWorksEndpoints.del(jw.documentId);
            notify("Job work deleted.");
            await loadRows();
        } catch (err) {
            console.error("delete job work", err);
            notify(err?.response?.data?.error?.message || "Failed to delete.", "danger");
        } finally {
            setBusy(null);
        }
    };

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h3><i className="fas fa-scissors me-2 text-success"></i>Job Work{statusFilter ? <span className="text-muted fs-6 ms-2">({statusFilter})</span> : null}</h3>
                    <button className="btn btn-primary btn-sm" onClick={openCreate}><i className="fas fa-plus me-1"></i>New Job Work</button>
                </div>

                {msg && (
                    <div className={`alert alert-${msg.variant} alert-dismissible py-2`}>
                        {msg.text}
                        <button type="button" className="btn-close" onClick={() => setMsg(null)}></button>
                    </div>
                )}

                {showForm && (
                    <div className="card mb-4">
                        <div className="card-body">
                            <h5>New Job Work</h5>
                            <form onSubmit={submitCreate}>
                                <div className="row g-3">
                                    <div className="col-md-3">
                                        <label className="form-label">Vendor (stitcher)</label>
                                        <select className="form-select" name="vendor" value={form.vendor} onChange={changeForm} required>
                                            <option value="">— select —</option>
                                            {vendors.map((v) => <option key={v.documentId} value={v.documentId}>{v.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="col-md-3">
                                        <label className="form-label">Branch</label>
                                        <select className="form-select" name="branch" value={form.branch} onChange={changeForm}>
                                            <option value="">— none —</option>
                                            {branches.map((b) => <option key={b.documentId} value={b.documentId}>{b.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="col-md-3">
                                        <label className="form-label">Service</label>
                                        <input className="form-control" name="service" value={form.service} onChange={changeForm} placeholder="e.g. Stitching" />
                                    </div>
                                    <div className="col-md-3">
                                        <label className="form-label">Agreed rate / piece</label>
                                        <input className="form-control" type="number" step="0.01" min="0" name="rate" value={form.rate} onChange={changeForm} placeholder="default charge per unit" />
                                    </div>
                                    <div className="col-md-3">
                                        <label className="form-label">Reference name <span className="text-muted small">(optional)</span></label>
                                        <input className="form-control" name="name" value={form.name} onChange={changeForm} />
                                    </div>
                                    <div className="col-md-3">
                                        <label className="form-label">Expected return</label>
                                        <input className="form-control" type="date" name="expected" value={form.expected} onChange={changeForm} />
                                    </div>
                                    <div className="col-md-6">
                                        <label className="form-label">Notes</label>
                                        <input className="form-control" name="notes" value={form.notes} onChange={changeForm} />
                                    </div>

                                    <div className="col-12">
                                        <label className="form-label">Add units by barcode</label>
                                        <div className="input-group" style={{ maxWidth: 420 }}>
                                            <input className="form-control" value={barcode} onChange={(e) => setBarcode(e.target.value)}
                                                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUnit(); } }}
                                                placeholder="scan or type a stock-item barcode" />
                                            <button className="btn btn-outline-secondary" type="button" onClick={addUnit} disabled={adding}>
                                                {adding ? <span className="spinner-border spinner-border-sm"></span> : <><i className="fas fa-plus me-1"></i>Add</>}
                                            </button>
                                        </div>
                                        {units.length > 0 && (
                                            <div className="table-responsive mt-2">
                                                <table className="table table-sm align-middle mb-0" style={{ maxWidth: 760 }}>
                                                    <thead><tr><th>Barcode</th><th>Product</th><th className="text-end">Cost</th><th>Status</th><th></th></tr></thead>
                                                    <tbody>
                                                        {units.map((u) => (
                                                            <tr key={u.documentId}>
                                                                <td><code>{u.barcode}</code></td>
                                                                <td>{u.product}</td>
                                                                <td className="text-end">{u.cost != null ? Number(u.cost).toFixed(2) : "—"}</td>
                                                                <td>{u.status === "InStock" ? <span className="badge bg-success">InStock</span> : <span className="badge bg-warning text-dark">{u.status}</span>}</td>
                                                                <td><button type="button" className="btn btn-sm btn-outline-danger" onClick={() => removeUnit(u.documentId)}><i className="fas fa-times"></i></button></td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                                <div className="small text-muted mt-1">{units.length} unit(s). Only whole <strong>InStock</strong> units are sent on dispatch.</div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="mt-3 d-flex gap-2">
                                    <button className="btn btn-success btn-sm" type="submit" disabled={saving}>{saving ? "Saving..." : "Create Draft"}</button>
                                    <button className="btn btn-secondary btn-sm" type="button" onClick={() => setShowForm(false)}>Cancel</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className="text-center py-5"><div className="spinner-border"></div></div>
                ) : rows.length === 0 ? (
                    <div className="alert alert-info">No job work orders{statusFilter ? ` in status ${statusFilter}` : ""}. Click &quot;New Job Work&quot; to send stock for outside processing.</div>
                ) : (
                    <div className="table-responsive">
                        <table className="table table-hover align-middle">
                            <thead>
                                <tr><th>Number</th><th>Vendor</th><th>Service</th><th className="text-center">Units</th><th className="text-end">Charges</th><th>Status</th><th>Actions</th></tr>
                            </thead>
                            <tbody>
                                {rows.map((jw) => {
                                    const b = `${jw.documentId}`;
                                    return (
                                        <tr key={jw.documentId}>
                                            <td><Link href={`/job-work/${jw.documentId}`}><code>{jw.jw_number}</code></Link></td>
                                            <td>{jw.vendor?.name || "—"}</td>
                                            <td>{jw.service_description || "—"}{jw.name ? <span className="text-muted small ms-1">/ {jw.name}</span> : null}</td>
                                            <td className="text-center">{unitCount(jw)}</td>
                                            <td className="text-end">{jw.total_charge ? Number(jw.total_charge).toFixed(2) : "—"}</td>
                                            <td><span className={`badge ${STATUS_BADGE[jw.status] || "bg-secondary"}`}>{jw.status}</span></td>
                                            <td>
                                                <div className="d-flex gap-1 flex-wrap">
                                                    <Link className="btn btn-sm btn-outline-primary" href={`/job-work/${jw.documentId}`}><i className="fas fa-eye"></i></Link>
                                                    {jw.status === "Draft" && (
                                                        <button className="btn btn-sm btn-outline-warning" disabled={busy === `${b}:dispatch`} onClick={() => doAction(jw, "dispatch", "Dispatch this job work? Units leave stock and go to the vendor.")}>
                                                            {busy === `${b}:dispatch` ? <span className="spinner-border spinner-border-sm"></span> : <><i className="fas fa-truck me-1"></i>Dispatch</>}
                                                        </button>
                                                    )}
                                                    {(jw.status === "Draft" || jw.status === "Dispatched") && (
                                                        <button className="btn btn-sm btn-outline-secondary" disabled={busy === `${b}:cancel`} onClick={() => doAction(jw, "cancel", "Cancel this job work? Dispatched units revert to InStock.")}>
                                                            <i className="fas fa-ban"></i>
                                                        </button>
                                                    )}
                                                    {jw.status === "Draft" && (
                                                        <button className="btn btn-sm btn-outline-danger" disabled={busy === `${b}:del`} onClick={() => delRow(jw)}><i className="fas fa-trash"></i></button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {meta && meta.pageCount > 1 && (
                    <div className="d-flex justify-content-between align-items-center">
                        <span className="text-muted small">Page {meta.page} of {meta.pageCount} · {meta.total} total</span>
                        <div className="btn-group btn-group-sm">
                            <button className="btn btn-outline-secondary" disabled={loading || meta.page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
                            <button className="btn btn-outline-secondary" disabled={loading || meta.page >= meta.pageCount} onClick={() => setPage((p) => p + 1)}>Next</button>
                        </div>
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() { return { props: {} }; }
