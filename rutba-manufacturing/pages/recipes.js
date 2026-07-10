import React, { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { MfgProductionTemplatesEndpoints } from "@rutba/api-provider/endpoints";
import ProductSelect from "../components/ProductSelect";

// Production templates (reusable product-type recipes) — list, and instantiate a
// template into a concrete versioned BOM by mapping its type-level input/output
// slots to real products. The WO then runs off the emitted BOM.
const inputSlotKey = (l, i) => l.role_label || `input_${i}`;
const outputSlotKey = (o, i) => o.role_label || `output_${i}`;

export default function RecipesPage() {
    const { jwt } = useAuth();

    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState(null);

    // instantiate form
    const [sel, setSel] = useState(null); // full template (with input_lines/output_lines)
    const [selLoading, setSelLoading] = useState(false);
    const [outputProduct, setOutputProduct] = useState("");
    const [inputMap, setInputMap] = useState({});
    const [outputMap, setOutputMap] = useState({});
    const [name, setName] = useState("");
    const [activate, setActivate] = useState(false);
    const [creating, setCreating] = useState(false);
    const [result, setResult] = useState(null);

    const loadTemplates = useCallback(async () => {
        if (!jwt) return;
        setLoading(true);
        setErr(null);
        try {
            const res = await MfgProductionTemplatesEndpoints.list(1, 200, {});
            setTemplates(Array.isArray(res?.data) ? res.data : []);
        } catch (e) {
            console.error("Failed to load templates", e);
            setErr("Failed to load production templates.");
        } finally {
            setLoading(false);
        }
    }, [jwt]);

    useEffect(() => { loadTemplates(); }, [loadTemplates]);

    const openInstantiate = async (tpl) => {
        setResult(null);
        setSel(null);
        setSelLoading(true);
        setOutputProduct("");
        setInputMap({});
        setOutputMap({});
        setName(tpl.name || "");
        setActivate(false);
        try {
            const res = await MfgProductionTemplatesEndpoints.byId(tpl.documentId);
            setSel(res?.data || tpl);
        } catch (e) {
            console.error("Failed to load template", e);
            setErr("Failed to load the template.");
        } finally {
            setSelLoading(false);
        }
    };

    const createBom = async () => {
        if (!sel || !outputProduct) return;
        setCreating(true);
        setResult(null);
        try {
            const res = await MfgProductionTemplatesEndpoints.instantiate(sel.documentId, {
                outputProduct,
                inputMap,
                outputMap,
                name: name || undefined,
                activate,
            });
            const bom = res?.data;
            setResult({ ok: true, msg: `Created BOM "${bom?.name || "?"}" (${bom?.status || "Draft"}) with ${bom?.material_lines?.length ?? "?"} input(s) and ${bom?.outputs?.length ?? "?"} output(s).` });
            setSel(null);
        } catch (e) {
            console.error("Instantiate failed", e);
            setResult({ ok: false, msg: e?.response?.data?.error?.message || "Failed to instantiate the template." });
        } finally {
            setCreating(false);
        }
    };

    const inputLines = Array.isArray(sel?.input_lines) ? sel.input_lines : [];
    const outputLines = Array.isArray(sel?.output_lines) ? sel.output_lines : [];
    const nonPrimaryOutputs = outputLines.map((o, i) => ({ o, i })).filter(({ o }) => o.output_type !== "primary");

    return (
        <ProtectedRoute>
            <Layout>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h3><i className="fas fa-flask me-2 text-warning"></i>Recipes &amp; Templates</h3>
                    <button className="btn btn-outline-secondary btn-sm" onClick={loadTemplates} disabled={loading}><i className="fas fa-rotate me-1"></i>Refresh</button>
                </div>

                <p className="text-muted small mb-3">
                    Reusable product-type recipes. Instantiate one into a concrete, versioned BOM by mapping its
                    input/output slots to real products — the work order then runs off that BOM.
                </p>

                {err && <div className="alert alert-danger py-2">{err}</div>}
                {result && <div className={`alert py-2 ${result.ok ? "alert-success" : "alert-danger"}`}>{result.msg}</div>}

                {loading ? (
                    <div className="text-center py-5"><div className="spinner-border"></div></div>
                ) : templates.length === 0 ? (
                    <div className="alert alert-info">No production templates yet. Create them in Strapi admin, then instantiate here.</div>
                ) : (
                    <div className="table-responsive mb-4">
                        <table className="table table-sm table-hover align-middle">
                            <thead>
                                <tr>
                                    <th>Template</th>
                                    <th>Code</th>
                                    <th className="text-end">Inputs</th>
                                    <th className="text-end">Outputs</th>
                                    <th>Active</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {templates.map((t) => (
                                    <tr key={t.documentId} className={sel?.documentId === t.documentId ? "table-active" : ""}>
                                        <td>{t.name || <span className="text-muted">(unnamed)</span>}</td>
                                        <td><code>{t.code || "—"}</code></td>
                                        <td className="text-end">{Array.isArray(t.input_lines) ? t.input_lines.length : "—"}</td>
                                        <td className="text-end">{Array.isArray(t.output_lines) ? t.output_lines.length : "—"}</td>
                                        <td>{t.is_active ? <span className="badge bg-success">Active</span> : <span className="badge bg-secondary">Inactive</span>}</td>
                                        <td className="text-end">
                                            <button className="btn btn-sm btn-warning" onClick={() => openInstantiate(t)} disabled={selLoading}>
                                                <i className="fas fa-wand-magic-sparkles me-1"></i>Instantiate
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {selLoading && <div className="text-center py-3"><div className="spinner-border spinner-border-sm"></div></div>}

                {sel && (
                    <div className="card">
                        <div className="card-header d-flex justify-content-between align-items-center">
                            <span><i className="fas fa-wand-magic-sparkles me-2 text-warning"></i>Instantiate &ldquo;{sel.name}&rdquo; → BOM</span>
                            <button className="btn-close" onClick={() => setSel(null)} aria-label="Close"></button>
                        </div>
                        <div className="card-body">
                            <div className="row g-3">
                                <div className="col-md-6">
                                    <label className="form-label small fw-semibold">Primary output product <span className="text-danger">*</span></label>
                                    <ProductSelect value={outputProduct} onChange={setOutputProduct} />
                                </div>
                                <div className="col-md-6">
                                    <label className="form-label small fw-semibold">BOM name</label>
                                    <input className="form-control form-control-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder={sel.name} />
                                </div>
                            </div>

                            {inputLines.length > 0 && (
                                <>
                                    <hr />
                                    <div className="fw-semibold small mb-2">Input slots → products</div>
                                    <div className="row g-3">
                                        {inputLines.map((l, i) => {
                                            const slot = inputSlotKey(l, i);
                                            return (
                                                <div className="col-md-6" key={slot}>
                                                    <label className="form-label small">
                                                        {l.role_label || `Input ${i + 1}`}
                                                        {l.kind ? <span className="badge bg-light text-dark ms-1">{l.kind}</span> : null}
                                                        {l.quantity != null ? <span className="text-muted"> · qty {l.quantity}{l.uom ? ` ${l.uom}` : ""}</span> : null}
                                                    </label>
                                                    <ProductSelect value={inputMap[slot] || ""} onChange={(v) => setInputMap((m) => ({ ...m, [slot]: v }))} />
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}

                            {nonPrimaryOutputs.length > 0 && (
                                <>
                                    <hr />
                                    <div className="fw-semibold small mb-2">Additional output slots → products</div>
                                    <div className="row g-3">
                                        {nonPrimaryOutputs.map(({ o, i }) => {
                                            const slot = outputSlotKey(o, i);
                                            return (
                                                <div className="col-md-6" key={slot}>
                                                    <label className="form-label small">
                                                        {o.role_label || `Output ${i + 1}`}
                                                        <span className="badge bg-light text-dark ms-1">{o.output_type}</span>
                                                    </label>
                                                    <ProductSelect value={outputMap[slot] || ""} onChange={(v) => setOutputMap((m) => ({ ...m, [slot]: v }))} />
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}

                            <hr />
                            <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                                <div className="form-check">
                                    <input className="form-check-input" type="checkbox" id="activate" checked={activate} onChange={(e) => setActivate(e.target.checked)} />
                                    <label className="form-check-label small" htmlFor="activate">Create as <strong>Active</strong> (runs the kind-typing check) — otherwise Draft</label>
                                </div>
                                <div>
                                    <button className="btn btn-outline-secondary btn-sm me-2" onClick={() => setSel(null)} disabled={creating}>Cancel</button>
                                    <button className="btn btn-warning btn-sm" onClick={createBom} disabled={creating || !outputProduct}>
                                        {creating ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="fas fa-check me-1"></i>}Create BOM
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}
