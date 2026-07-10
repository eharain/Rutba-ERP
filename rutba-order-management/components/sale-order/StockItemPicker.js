import { useEffect, useState } from "react";
import { StockItemsEndpoints } from "@rutba/api-provider/endpoints/index.js";

// Bootstrap-styled modal that lists InStock units for a single product.
// Opens scoped to a line index on the order; clicking Attach posts to
// sale-orders/:id/attach-stock-item and closes on success. We don't paginate:
// typical product has < 100 InStock units; switch to search-by-sku when that
// stops being true.
export default function StockItemPicker({
  open,
  productDocumentId,
  productLabel,
  lineIndex,
  onAttach,
  onClose,
  attaching,
}) {
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !productDocumentId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      setUnits([]);
      try {
        const res = await StockItemsEndpoints.list(1, 100, {
          statusFilter: "InStock",
          productDocId: productDocumentId,
          sort: ["createdAt:asc"],
        });
        if (cancelled) return;
        const list = res?.data ?? [];
        // FEFO: soonest-expiry first; no-expiry (non-perishable) units last;
        // server createdAt order is the tiebreak.
        const fefo = [...list].sort((a, b) => {
          const ax = a.expiry_date ? String(a.expiry_date).slice(0, 10) : null;
          const bx = b.expiry_date ? String(b.expiry_date).slice(0, 10) : null;
          if (ax && bx) return ax < bx ? -1 : ax > bx ? 1 : 0;
          if (ax) return -1;
          if (bx) return 1;
          return 0;
        });
        setUnits(fefo);
        if (list.length === 0) setError("No InStock units available for this product.");
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load stock items", err);
        setError(err?.message || "Failed to load stock units.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, productDocumentId]);

  if (!open) return null;

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div
        className="modal-backdrop fade show"
        style={{ zIndex: 1040 }}
        onClick={attaching ? undefined : onClose}
      />
      <div
        className="modal fade show d-block"
        tabIndex="-1"
        role="dialog"
        style={{ zIndex: 1050 }}
      >
        <div className="modal-dialog modal-lg" role="document">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">
                <i className="fas fa-box me-2" />
                Pick a stock unit for line {lineIndex + 1}
              </h5>
              <button
                type="button"
                className="btn-close"
                aria-label="Close"
                onClick={onClose}
                disabled={attaching}
              />
            </div>
            <div className="modal-body">
              <p className="text-muted small">
                Showing InStock units for{" "}
                <strong>{productLabel || "this product"}</strong>. Selecting one
                transitions it to <em>Reserved</em>.
              </p>
              {loading && (
                <div className="text-center py-4 text-muted">
                  <i className="fas fa-spinner fa-spin me-2" />
                  Loading available units…
                </div>
              )}
              {!loading && error && (
                <div className="alert alert-warning small mb-0">{error}</div>
              )}
              {!loading && !error && units.length > 0 && (
                <div className="table-responsive" style={{ maxHeight: 420 }}>
                  <table className="table table-sm table-hover align-middle">
                    <thead className="sticky-top bg-light">
                      <tr>
                        <th>SKU</th>
                        <th>Barcode</th>
                        <th>Expiry</th>
                        <th>Name / Note</th>
                        <th>Branch</th>
                        <th>Cost</th>
                        <th style={{ width: 100 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {units.map((u) => {
                        const ex = u.expiry_date ? String(u.expiry_date).slice(0, 10) : null;
                        const expired = ex && ex < today;
                        return (
                        <tr key={u.documentId} className={expired ? "table-danger" : ""}>
                          <td className="font-monospace small">{u.sku || "—"}</td>
                          <td className="font-monospace small">{u.barcode || "—"}</td>
                          <td className="small">
                            {ex ? (
                              <span className={expired ? "text-danger fw-semibold" : ""}>
                                {ex}{expired ? " · expired" : ""}
                              </span>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                          <td className="small">{u.name || "—"}</td>
                          <td className="small">{u.branch?.name || "—"}</td>
                          <td className="small">
                            {u.cost_price != null ? Number(u.cost_price).toFixed(2) : "—"}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              onClick={() => onAttach(u)}
                              disabled={attaching || expired}
                              title={expired ? "Expired — cannot be sold" : undefined}
                            >
                              {attaching ? "…" : expired ? "Expired" : "Attach"}
                            </button>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={onClose}
                disabled={attaching}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
