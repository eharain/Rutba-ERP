import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Layout from "../../components/Layout";
import ProductSelect from "../../components/ProductSelect";
import ProtectedRoute from "@rutba/shared/components/ProtectedRoute";
import { useAuth } from "@rutba/shared/context/AuthContext";
import { MfgJobWorksEndpoints } from "@rutba/api-provider/endpoints";

const STATUS_BADGE = {
    Draft: "bg-secondary",
    Dispatched: "bg-warning text-dark",
    PartiallyReturned: "bg-info text-dark",
    Returned: "bg-primary",
    Closed: "bg-success",
    Cancelled: "bg-light text-muted border",
};

const LINE_BADGE = {
    Dispatched: "bg-warning text-dark",
    Returned: "bg-success",
    Lost: "bg-danger",
    Damaged: "bg-dark",
    Cancelled: "bg-light text-muted border",
};

const money = (v) => (v == null || v === "" ? "—" : Number(v).toFixed(2));

export default function JobWorkDetailPage() {
    const router = useRouter();
    const { documentId } = router.query;
    const { jwt } = useAuth();

    const [jw, setJw] = useState(null);
    const [loading, setLoading] = useState(true);
    const [msg, setMsg] = useState(null);
    const [busy, setBusy] = useState(null);

    // Per-line receive edits, keyed by line documentId:
    // { checked, outcome, product, charge, adjustment, sellingPrice, notes }
    const [edits, setEdits] = useState({});
    const [deduction, setDeduction] = useState("");

    const notify = (text, variant = "success") => setMsg({ text, variant });

    const load = useCallback(async () => {
        if (!jwt || !router.isReady || !documentId) return;
        setLoading(true);
        try {
            const res = await MfgJobWorksEndpoints.byId(documentId);
            const data = res?.data || null;
            setJw(data);
            setDeduction(data?.deduction_amount != null ? String(data.deduction_amount) : "");
        } catch (e) {
            console.error("load job work", e);
            notify("Failed to load job work.", "danger");
        } finally {
            setLoading(false);
        }
    }, [jwt, router.isReady, documentId]);

    useEffect(() => { load(); }, [load]);

    const lines = jw?.items || [];
    const openLines = useMemo(() => lines.filter((l) => l.status === "Dispatched"), [lines]);
    const resolved = useMemo(() => lines.filter((l) => ["Returned", "Lost", "Damaged"].includes(l.status)), [lines]);

    const editFor = (l) => edits[l.documentId] || {
        checked: false,
        outcome: "Returned",
        product: "",
        charge: jw?.agreed_rate != null ? String(jw.agreed_rate) : "",
        adjustment: "",
        sellingPrice: l.sent_selling_price != null ? String(l.sent_selling_price) : "",
        notes: "",
    };

    const setEdit = (l, patch) => setEdits((prev) => ({ ...prev, [l.documentId]: { ...editFor(l), ...patch } }));

    const checkedLines = openLines.filter((l) => editFor(l).checked);

    const doHeaderAction = async (action, confirmText) => {
        if (confirmText && !window.confirm(confirmText)) return;
        setBusy(action);
        try {
            const res = await MfgJobWorksEndpoints[action](jw.documentId);
            notify(`${jw.jw_number}: ${action} ok${res?.status ? ` → ${res.status}` : ""}${res?.bill?.bill_number ? ` · bill ${res.bill.bill_number}` : ""}.`);
            setEdits({});
            await load();
        } catch (err) {
            console.error(action, err);
            notify(err?.response?.data?.error?.message || `Failed to ${action}.`, "danger");
        } finally {
            setBusy(null);
        }
    };

    const receiveChecked = async () => {
        if (checkedLines.length === 0) { notify("Tick at least one line to receive.", "warning"); return; }
        const payload = checkedLines.map((l) => {
            const e = editFor(l);
            return {
                documentId: l.documentId,
                outcome: e.outcome,
                ...(e.outcome === "Returned" && e.product ? { returned_product: e.product } : {}),
                ...(e.charge !== "" ? { service_charge: Number(e.charge) } : {}),
                ...(e.outcome === "Returned" && e.adjustment !== "" ? { cost_adjustment: Number(e.adjustment) } : {}),
                ...(e.outcome === "Returned" && e.sellingPrice !== "" ? { returned_selling_price: Number(e.sellingPrice) } : {}),
                ...(e.notes ? { notes: e.notes } : {}),
            };
        });
        if (!window.confirm(`Receive ${payload.length} unit(s)? Returned units are transformed in place (product / cost / price) and go back InStock.`)) return;
        setBusy("receive");
        try {
            const res = await MfgJobWorksEndpoints.receive(jw.documentId, payload);
            const failed = (res?.results || []).filter((r) => r.error);
            if (failed.length) notify(`Received with ${failed.length} error(s): ${failed.map((f) => f.error).join("; ")}`, "warning");
            else notify(`Received ${payload.length} unit(s) → ${res?.status}.`);
            setEdits({});
            await load();
        } catch (err) {
            console.error("receive", err);
            notify(err?.response?.data?.error?.message || "Failed to receive.", "danger");
        } finally {
            setBusy(null);
        }
    };

    const saveDeduction = async () => {
        setBusy("deduction");
        try {
            await MfgJobWorksEndpoints.update(jw.documentId, { data: { deduction_amount: deduction === "" ? 0 : Number(deduction) } });
            notify("Deduction saved.");
            await load();
        } catch (err) {
            console.error("deduction", err);
            notify(err?.response?.data?.error?.message || "Failed to save deduction.", "danger");
        } finally {
            setBusy(null);
        }
    };

    const totalCharge = Number(jw?.total_charge || 0);
    const payable = Math.round((totalCharge - Number(deduction || 0)) * 100) / 100;

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h3>
                        <Link href="/job-work" className="text-decoration-none text-muted me-2"><i className="fas fa-arrow-left"></i></Link>
                        <i className="fas fa-scissors me-2 text-success"></i>
                        {jw ? <>Job Work <code>{jw.jw_number}</code></> : "Job Work"}
                        {jw && <span className={`badge ms-2 ${STATUS_BADGE[jw.status] || "bg-secondary"}`}>{jw.status}</span>}
                    </h3>
                    {jw && (
                        <div className="d-flex gap-2">
                            {jw.status === "Draft" && (
                                <button className="btn btn-warning btn-sm" disabled={busy === "dispatch"} onClick={() => doHeaderAction("dispatch", "Dispatch this job work? Units leave stock and go to the vendor.")}>
                                    {busy === "dispatch" ? <span className="spinner-border spinner-border-sm"></span> : <><i className="fas fa-truck me-1"></i>Dispatch</>}
                                </button>
                            )}
                            {(jw.status === "Draft" || jw.status === "Dispatched") && (
                                <button className="btn btn-outline-secondary btn-sm" disabled={busy === "cancel"} onClick={() => doHeaderAction("cancel", "Cancel this job work? Dispatched units revert to InStock.")}>
                                    <i className="fas fa-ban me-1"></i>Cancel
                                </button>
                            )}
                            {jw.status === "Returned" && (
                                <button className="btn btn-success btn-sm" disabled={busy === "close"} onClick={() => doHeaderAction("close", `Close this job work? A vendor bill of ${money(payable)} will be generated for ${jw.vendor?.name || "the vendor"}.`)}>
                                    {busy === "close" ? <span className="spinner-border spinner-border-sm"></span> : <><i className="fas fa-file-invoice-dollar me-1"></i>Close &amp; Bill</>}
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {msg && (
                    <div className={`alert alert-${msg.variant} alert-dismissible py-2`}>
                        {msg.text}
                        <button type="button" className="btn-close" onClick={() => setMsg(null)}></button>
                    </div>
                )}

                {loading ? (
                    <div className="text-center py-5"><div className="spinner-border"></div></div>
                ) : !jw ? (
                    <div className="alert alert-warning">Job work not found.</div>
                ) : (
                    <>
                        <div className="card mb-3">
                            <div className="card-body">
                                <div className="row g-3">
                                    <div className="col-md-3"><div className="text-muted small">Vendor</div><div className="fw-semibold">{jw.vendor?.name || "—"}</div></div>
                                    <div className="col-md-2"><div className="text-muted small">Branch</div><div>{jw.branch?.name || "—"}</div></div>
                                    <div className="col-md-2"><div className="text-muted small">Service</div><div>{jw.service_description || "—"}</div></div>
                                    <div className="col-md-2"><div className="text-muted small">Agreed rate</div><div>{money(jw.agreed_rate)}</div></div>
                                    <div className="col-md-3"><div className="text-muted small">Expected return</div><div>{jw.expected_return_date || "—"}</div></div>
                                    <div className="col-md-3"><div className="text-muted small">Dispatched</div><div>{jw.dispatched_at ? new Date(jw.dispatched_at).toLocaleString() : "—"}</div></div>
                                    <div className="col-md-3"><div className="text-muted small">Closed</div><div>{jw.closed_at ? new Date(jw.closed_at).toLocaleString() : "—"}</div></div>
                                    <div className="col-md-3">
                                        <div className="text-muted small">Totals</div>
                                        <div>
                                            Charges <strong>{money(totalCharge)}</strong>
                                            {Number(deduction || 0) > 0 && <> − deduction {money(deduction)} = <strong>{money(payable)}</strong></>}
                                        </div>
                                    </div>
                                    <div className="col-md-3">
                                        <div className="text-muted small">Vendor bill</div>
                                        <div>{jw.bill ? <><code>{jw.bill.bill_number}</code> <span className="badge bg-light text-dark border">{jw.bill.status}</span></> : "—"}</div>
                                    </div>
                                    {jw.notes && <div className="col-12"><div className="text-muted small">Notes</div><div>{jw.notes}</div></div>}
                                </div>

                                {["Dispatched", "PartiallyReturned", "Returned"].includes(jw.status) && (
                                    <div className="mt-3 d-flex align-items-end gap-2">
                                        <div>
                                            <label className="form-label mb-1 small text-muted">Deduction (recovery for lost/damaged, reduces the bill)</label>
                                            <input className="form-control form-control-sm" style={{ maxWidth: 180 }} type="number" step="0.01" min="0"
                                                value={deduction} onChange={(e) => setDeduction(e.target.value)} />
                                        </div>
                                        <button className="btn btn-outline-primary btn-sm" disabled={busy === "deduction"} onClick={saveDeduction}>Save</button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {jw.status === "Draft" && (
                            <div className="card mb-3">
                                <div className="card-body">
                                    <h5>Units to send ({(jw.stock_items || []).length})</h5>
                                    <div className="table-responsive">
                                        <table className="table table-sm align-middle">
                                            <thead><tr><th>Barcode</th><th>Product</th><th className="text-end">Cost</th><th>Status</th></tr></thead>
                                            <tbody>
                                                {(jw.stock_items || []).map((u) => (
                                                    <tr key={u.documentId}>
                                                        <td><code>{u.barcode}</code></td>
                                                        <td>{u.product?.name || u.name || "—"}</td>
                                                        <td className="text-end">{money(u.cost_price)}</td>
                                                        <td><span className={`badge ${u.status === "InStock" ? "bg-success" : "bg-warning text-dark"}`}>{u.status}</span></td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="small text-muted">Only whole InStock units are sent on dispatch. Edit the unit list from the Job Work list page (delete + recreate) while in Draft.</div>
                                </div>
                            </div>
                        )}

                        {openLines.length > 0 && (
                            <div className="card mb-3">
                                <div className="card-body">
                                    <div className="d-flex justify-content-between align-items-center mb-2">
                                        <h5 className="mb-0">At vendor ({openLines.length})</h5>
                                        <button className="btn btn-success btn-sm" disabled={busy === "receive" || checkedLines.length === 0} onClick={receiveChecked}>
                                            {busy === "receive" ? <span className="spinner-border spinner-border-sm"></span> : <><i className="fas fa-box-open me-1"></i>Receive selected ({checkedLines.length})</>}
                                        </button>
                                    </div>
                                    <div className="table-responsive">
                                        <table className="table table-sm align-middle">
                                            <thead>
                                                <tr>
                                                    <th style={{ width: 32 }}>
                                                        <input type="checkbox" className="form-check-input"
                                                            checked={openLines.length > 0 && checkedLines.length === openLines.length}
                                                            onChange={(e) => {
                                                                const checked = e.target.checked;
                                                                setEdits((prev) => {
                                                                    const next = { ...prev };
                                                                    openLines.forEach((l) => { next[l.documentId] = { ...(next[l.documentId] || editFor(l)), checked }; });
                                                                    return next;
                                                                });
                                                            }} />
                                                    </th>
                                                    <th>Barcode</th>
                                                    <th>Sent as</th>
                                                    <th className="text-end">Sent cost</th>
                                                    <th style={{ minWidth: 110 }}>Outcome</th>
                                                    <th style={{ minWidth: 220 }}>Return as <span className="text-muted small">(blank = same product)</span></th>
                                                    <th style={{ width: 110 }}>Charge</th>
                                                    <th style={{ width: 110 }}>Cost +/−</th>
                                                    <th style={{ width: 120 }}>New price</th>
                                                    <th style={{ minWidth: 140 }}>Notes</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {openLines.map((l) => {
                                                    const e = editFor(l);
                                                    const isReturn = e.outcome === "Returned";
                                                    const newCost = isReturn
                                                        ? Math.round(((Number(l.sent_cost) || 0) + Number(e.charge || 0) + Number(e.adjustment || 0)) * 100) / 100
                                                        : null;
                                                    return (
                                                        <tr key={l.documentId} className={e.checked ? "table-active" : ""}>
                                                            <td><input type="checkbox" className="form-check-input" checked={e.checked} onChange={(ev) => setEdit(l, { checked: ev.target.checked })} /></td>
                                                            <td><code>{l.barcode}</code></td>
                                                            <td>{l.sent_product?.name || "—"}</td>
                                                            <td className="text-end">{money(l.sent_cost)}</td>
                                                            <td>
                                                                <select className="form-select form-select-sm" value={e.outcome} onChange={(ev) => setEdit(l, { outcome: ev.target.value, checked: true })}>
                                                                    <option>Returned</option>
                                                                    <option>Lost</option>
                                                                    <option>Damaged</option>
                                                                </select>
                                                            </td>
                                                            <td>
                                                                {isReturn ? (
                                                                    <ProductSelect value={e.product} onChange={(v) => setEdit(l, { product: v, checked: true })} placeholder="same product" />
                                                                ) : <span className="text-muted small">n/a</span>}
                                                            </td>
                                                            <td><input className="form-control form-control-sm" type="number" step="0.01" min="0" value={e.charge} onChange={(ev) => setEdit(l, { charge: ev.target.value, checked: true })} /></td>
                                                            <td>{isReturn ? <input className="form-control form-control-sm" type="number" step="0.01" value={e.adjustment} onChange={(ev) => setEdit(l, { adjustment: ev.target.value, checked: true })} placeholder="0" /> : <span className="text-muted small">n/a</span>}</td>
                                                            <td>
                                                                {isReturn ? (
                                                                    <>
                                                                        <input className="form-control form-control-sm" type="number" step="0.01" min="0" value={e.sellingPrice} onChange={(ev) => setEdit(l, { sellingPrice: ev.target.value, checked: true })} />
                                                                        <div className="small text-muted">cost → {money(newCost)}</div>
                                                                    </>
                                                                ) : <span className="text-muted small">n/a</span>}
                                                            </td>
                                                            <td><input className="form-control form-control-sm" value={e.notes} onChange={(ev) => setEdit(l, { notes: ev.target.value })} /></td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}

                        {resolved.length > 0 && (
                            <div className="card mb-3">
                                <div className="card-body">
                                    <h5>Resolved ({resolved.length})</h5>
                                    <div className="table-responsive">
                                        <table className="table table-sm align-middle">
                                            <thead>
                                                <tr><th>Barcode</th><th>Sent as</th><th className="text-end">Sent cost</th><th>Outcome</th><th>Returned as</th><th className="text-end">Charge</th><th className="text-end">Cost +/−</th><th className="text-end">New cost</th><th className="text-end">New price</th><th>When</th><th>Notes</th></tr>
                                            </thead>
                                            <tbody>
                                                {resolved.map((l) => (
                                                    <tr key={l.documentId}>
                                                        <td><code>{l.barcode}</code></td>
                                                        <td>{l.sent_product?.name || "—"}</td>
                                                        <td className="text-end">{money(l.sent_cost)}</td>
                                                        <td><span className={`badge ${LINE_BADGE[l.status] || "bg-secondary"}`}>{l.status}</span></td>
                                                        <td>{l.returned_product?.name || (l.status === "Returned" ? l.sent_product?.name : "—")}</td>
                                                        <td className="text-end">{money(l.service_charge)}</td>
                                                        <td className="text-end">{money(l.cost_adjustment)}</td>
                                                        <td className="text-end">{money(l.returned_cost)}</td>
                                                        <td className="text-end">{money(l.returned_selling_price)}</td>
                                                        <td className="small text-muted">{l.returned_at ? new Date(l.returned_at).toLocaleString() : "—"}</td>
                                                        <td className="small">{l.notes || ""}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() { return { props: {} }; }
