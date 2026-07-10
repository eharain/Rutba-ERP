import React, { useState } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { StockLevelsEndpoints, StockItemsEndpoints, WarehousesEndpoints } from "@rutba/api-provider/endpoints";

// Admin maintenance jobs — each is an idempotent, server-side reconcile exposed
// by the Foundation. They post to auth:false routes that enforce admin manually,
// so a non-admin gets a 403 surfaced as an error here.
const JOBS = [
    {
        key: "levels",
        icon: "fa-layer-group",
        border: "border-info",
        title: "Rebuild stock-level cache",
        desc: "Recompute the per-(product, warehouse) on-hand cache from live stock-items. Run after suspected drift.",
        run: () => StockLevelsEndpoints.recompute(),
        confirm: "Rebuild the entire stock-level cache now?",
    },
    {
        key: "product",
        icon: "fa-boxes-stacked",
        border: "border-primary",
        title: "Reconcile product stock",
        desc: "Rebuild every product.stock_quantity from the live count of InStock units. The global cache twin of the above.",
        run: () => StockItemsEndpoints.recomputeProductStock(),
        confirm: "Reconcile product.stock_quantity for all products now?",
    },
    {
        key: "backfill",
        icon: "fa-warehouse",
        border: "border-success",
        title: "Backfill default locations",
        desc: "Ensure every branch has a default warehouse + receiving bin, place any unplaced stock-items, and rebuild levels. Idempotent.",
        run: () => WarehousesEndpoints.backfillDefaultLocations(),
        confirm: "Run the default-location backfill now? (Idempotent — only touches unplaced items.)",
    },
];

export default function MaintenancePage() {
    const [busy, setBusy] = useState(null);
    const [results, setResults] = useState({}); // key -> { ok, data|error, at }

    const runJob = async (job) => {
        if (!window.confirm(job.confirm)) return;
        setBusy(job.key);
        try {
            const res = await job.run();
            setResults((r) => ({ ...r, [job.key]: { ok: true, data: res } }));
        } catch (err) {
            console.error(`Job ${job.key} failed`, err);
            const message = err?.response?.data?.error?.message || err?.message || "Failed.";
            const status = err?.response?.status;
            setResults((r) => ({ ...r, [job.key]: { ok: false, error: status ? `${status}: ${message}` : message } }));
        } finally {
            setBusy(null);
        }
    };

    return (
        <ProtectedRoute>
            <Layout>
                <h3 className="mb-1"><i className="fas fa-screwdriver-wrench me-2 text-secondary"></i>Maintenance</h3>
                <p className="text-muted small mb-4">Admin-only reconcile jobs. All are idempotent and safe to re-run.</p>

                <div className="row g-3">
                    {JOBS.map((job) => {
                        const r = results[job.key];
                        return (
                            <div className="col-md-4" key={job.key}>
                                <div className={`card ${job.border} h-100`}>
                                    <div className="card-body d-flex flex-column">
                                        <h5 className="card-title"><i className={`fas ${job.icon} me-2`}></i>{job.title}</h5>
                                        <p className="card-text text-muted small flex-grow-1">{job.desc}</p>
                                        <button className="btn btn-outline-secondary btn-sm align-self-start" disabled={busy === job.key} onClick={() => runJob(job)}>
                                            {busy === job.key
                                                ? <><span className="spinner-border spinner-border-sm me-1"></span>Running…</>
                                                : <><i className="fas fa-play me-1"></i>Run</>}
                                        </button>

                                        {r && (
                                            <div className={`mt-3 alert ${r.ok ? "alert-success" : "alert-danger"} py-2 mb-0 small`}>
                                                {r.ok ? (
                                                    <pre className="mb-0" style={{ whiteSpace: "pre-wrap", fontSize: "0.75rem" }}>{JSON.stringify(r.data, null, 2)}</pre>
                                                ) : (
                                                    <span>{r.error}</span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </Layout>
        </ProtectedRoute>
    );
}
