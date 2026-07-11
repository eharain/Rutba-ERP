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
  onSellUnits,
  onClose,
  attaching,
}) {
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sellQty, setSellQty] = useState("");

  useEffect(() => {
    if (!open || !productDocumentId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      setUnits([]);
      setSellQty("");
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
  // Divisible products: any unit holding more than one sellable sub-unit. Sell a
  // quantity (the server allocates across items) rather than attaching one whole
  // unit. Inferred from the units themselves — no dependency on the line's flag.
  const remainingOf = (u) => (Number(u.sellable_units) || 1) - (Number(u.units_sold) || 0);
  const unitPriceOf = (u) => { const t = Number(u.sellable_units) || 1; const p = Number(u.selling_price) || 0; return t > 0 ? p / t : p; };
  const isDivisible = units.some((u) => (Number(u.sellable_units) || 1) > 1);
  const canSell = isDivisible && typeof onSellUnits === "function";
  const totalRemaining = Math.round(units.reduce((s, u) => s + Math.max(0, remainingOf(u)), 0) * 1000) / 1000;

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
                <strong>{productLabel || "this product"}</strong>.{" "}
                {canSell
                  ? "This product is sold in units — enter a quantity to sell (the server allocates across items)."
                  : "Selecting one transitions it to Reserved."}
              </p>
              {canSell && (
                <div className="alert alert-info d-flex flex-wrap align-items-center gap-2 py-2">
                  <i className="fas fa-ruler-combined" />
                  <span className="small fw-semibold">{totalRemaining} sub-unit(s) available.</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    className="form-control form-control-sm"
                    style={{ width: 110 }}
                    value={sellQty}
                    onChange={(e) => setSellQty(e.target.value)}
                    placeholder="qty"
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    disabled={attaching || !(Number(sellQty) > 0)}
                    onClick={() => onSellUnits(Number(sellQty))}
                  >
                    {attaching ? "…" : `Sell ${Number(sellQty) > 0 ? sellQty : ""} unit(s)`}
                  </button>
                  <span className="text-muted small">auto-picks opened items first, then earliest expiry — or sell from a specific unit in the table.</span>
                </div>
              )}
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
                        {canSell && <th className="text-end">Remaining</th>}
                        {canSell && <th className="text-end">Unit price</th>}
                        <th>Name / Note</th>
                        <th>Branch</th>
                        <th>Cost</th>
                        <th style={{ width: 120 }} />
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
                          {canSell && (
                            <td className="text-end small">
                              {Math.round(remainingOf(u) * 1000) / 1000}
                              <span className="text-muted"> / {Number(u.sellable_units) || 1}</span>
                              {(Number(u.units_sold) || 0) > 0 ? <span className="badge bg-warning text-dark ms-1">open</span> : null}
                            </td>
                          )}
                          {canSell && <td className="text-end small">{unitPriceOf(u).toFixed(2)}</td>}
                          <td className="small">{u.name || "—"}</td>
                          <td className="small">{u.branch?.name || "—"}</td>
                          <td className="small">
                            {u.cost_price != null ? Number(u.cost_price).toFixed(2) : "—"}
                          </td>
                          <td>
                            {canSell ? (
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-primary"
                                onClick={() => onSellUnits(Number(sellQty), u.documentId)}
                                disabled={attaching || expired || !(Number(sellQty) > 0)}
                                title={expired ? "Expired — cannot be sold" : !(Number(sellQty) > 0) ? "Enter a quantity above first" : "Sell from this specific unit (warns if a nearer-expiry unit exists)"}
                              >
                                {attaching ? "…" : expired ? "Expired" : "Sell here"}
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-sm btn-primary"
                                onClick={() => onAttach(u)}
                                disabled={attaching || expired}
                                title={expired ? "Expired — cannot be sold" : undefined}
                              >
                                {attaching ? "…" : expired ? "Expired" : "Attach"}
                              </button>
                            )}
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
