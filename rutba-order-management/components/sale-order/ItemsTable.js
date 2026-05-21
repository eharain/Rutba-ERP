import { resolveItemThumb } from "./util";

// Shared items table. `mode` switches between:
//   - "edit"    — Draft stage; rows can be added/removed, qty/price/product edited
//   - "fulfill" — Preparation stage; rows are locked but the Stock-unit column
//                 exposes the picker so warehouse staff can attach units
//   - "view"    — every later stage; everything is read-only including the
//                 stock-unit column (it just renders attached info)
export default function ItemsTable({
  items,
  mode = "view",
  productsCatalog = [],
  onUpdateField,
  onSelectProduct,
  onAddRow,
  onRemoveRow,
  onOpenPicker,
  isNewOrder = false,
}) {
  const editing = mode === "edit";
  const fulfilling = mode === "fulfill";

  return (
    <div className="card mb-4">
      <div className="card-header bg-light fw-semibold d-flex align-items-center justify-content-between">
        <span>
          <i className="fas fa-box-open me-2" />
          Products
        </span>
        {editing && (
          <button type="button" className="btn btn-sm btn-outline-primary" onClick={onAddRow}>
            <i className="fas fa-plus me-1" />
            Add Product
          </button>
        )}
      </div>
      <div className="card-body">
        {fulfilling && (
          <div className="alert alert-light border small mb-2">
            Attach a physical <strong>stock unit</strong> per line. Once attached, the
            unit moves to <em>Reserved</em> and is removed from available stock.
          </div>
        )}
        <div className="table-responsive">
          <table className="table table-sm align-middle">
            <thead>
              <tr>
                <th style={{ width: 64 }}>Image</th>
                <th style={{ minWidth: 240 }}>Product</th>
                <th style={{ minWidth: 200 }}>Product Name / Variant</th>
                <th style={{ width: 100 }}>Qty</th>
                <th style={{ width: 140 }}>Unit Price</th>
                <th style={{ width: 140 }}>Total</th>
                {(fulfilling || mode === "view") && (
                  <th style={{ minWidth: 200 }}>Stock Unit</th>
                )}
                {editing && <th style={{ width: 90 }} />}
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const qty = Number(item.quantity || 0);
                const unitPrice = Number(item.price || 0);
                const lineTotal = qty * unitPrice;
                const thumbUrl = resolveItemThumb(item.imageMedia);
                const variantTermsEntries =
                  item.variantTerms && typeof item.variantTerms === "object"
                    ? Object.entries(item.variantTerms)
                    : [];

                return (
                  <tr key={index}>
                    <td>
                      {thumbUrl ? (
                        <img
                          src={thumbUrl}
                          alt={item.productName || "item"}
                          style={{
                            width: 48,
                            height: 48,
                            objectFit: "cover",
                            borderRadius: 4,
                            background: "#f4f4f5",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: 4,
                            background: "#f4f4f5",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#9ca3af",
                            fontSize: 18,
                          }}
                          title="No image attached"
                        >
                          <i className="fas fa-image" />
                        </div>
                      )}
                    </td>
                    <td>
                      {editing ? (
                        <select
                          className="form-select form-select-sm"
                          value={item.productDocumentId}
                          onChange={(e) => onSelectProduct(index, e.target.value)}
                        >
                          <option value="">Select product...</option>
                          {productsCatalog.map((p) => (
                            <option key={p.documentId} value={p.documentId}>
                              {p.name || p.documentId}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="small">{item.productName || item.productDocumentId || "—"}</span>
                      )}
                    </td>
                    <td>
                      {editing ? (
                        <input
                          className="form-control form-control-sm"
                          value={item.productName}
                          onChange={(e) => onUpdateField(index, "productName", e.target.value)}
                        />
                      ) : (
                        <span className="small">{item.productName || "—"}</span>
                      )}
                      {(item.variantName || variantTermsEntries.length > 0) && (
                        <div className="mt-1 d-flex flex-wrap gap-1">
                          {item.variantName && (
                            <span className="badge bg-secondary">{item.variantName}</span>
                          )}
                          {variantTermsEntries.map(([k, v]) => (
                            <span key={k} className="badge bg-light text-dark border">
                              {k}: {String(v)}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      {editing ? (
                        <input
                          className="form-control form-control-sm"
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => onUpdateField(index, "quantity", e.target.value)}
                        />
                      ) : (
                        <span>{qty}</span>
                      )}
                    </td>
                    <td>
                      {editing ? (
                        <input
                          className="form-control form-control-sm"
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.price}
                          onChange={(e) => onUpdateField(index, "price", e.target.value)}
                        />
                      ) : (
                        <span>{unitPrice.toFixed(2)}</span>
                      )}
                    </td>
                    <td>{lineTotal.toFixed(2)}</td>

                    {(fulfilling || mode === "view") && (
                      <td>
                        {item.stockItemInfo ? (
                          <div className="small">
                            <div className="fw-semibold text-success">
                              <i className="fas fa-check-circle me-1" />
                              {item.stockItemInfo.sku ||
                                item.stockItemInfo.barcode ||
                                item.stockItemInfo.name ||
                                "Attached"}
                            </div>
                            <div className="text-muted">
                              {item.stockItemInfo.status || "Reserved"}
                              {item.stockItemInfo.barcode && item.stockItemInfo.sku && (
                                <span className="ms-2">· {item.stockItemInfo.barcode}</span>
                              )}
                            </div>
                            {fulfilling && (
                              <button
                                type="button"
                                className="btn btn-link btn-sm p-0 mt-1"
                                onClick={() => onOpenPicker(index)}
                              >
                                Change
                              </button>
                            )}
                          </div>
                        ) : fulfilling ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => onOpenPicker(index)}
                            disabled={isNewOrder || !item.productDocumentId}
                            title={
                              isNewOrder
                                ? "Save the order first"
                                : !item.productDocumentId
                                ? "Pick a product first"
                                : "Attach an InStock unit"
                            }
                          >
                            <i className="fas fa-box me-1" />
                            Attach unit
                          </button>
                        ) : (
                          <span className="text-muted small">—</span>
                        )}
                      </td>
                    )}

                    {editing && (
                      <td>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => onRemoveRow(index)}
                          disabled={items.length <= 1}
                        >
                          <i className="fas fa-trash" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
