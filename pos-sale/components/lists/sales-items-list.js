import { useState, useEffect, useRef } from 'react';
import { MAX_CUSTOM_QTY, CUSTOM_QTY_WARN } from '@rutba/pos-shared/lib/utils';
import { StraipImageUrl, isImage } from '@rutba/api-provider/lib/api';

/**
 * Numeric cell that keeps a local text draft while focused so typing stays
 * smooth — without it, the model-derived `value` is re-applied on every
 * keystroke, which eats decimal points ("25." → "25") and snaps a cleared
 * field back to a default. The model remains the source of truth: each valid
 * keystroke commits, and on blur the field re-syncs to the (possibly clamped)
 * model value.
 */
function NumberCell({ value, onCommit, disabled, min = 0, max, step = 'any', invalid = false, className = '', style }) {
    const [draft, setDraft] = useState(() => (value == null ? '' : String(value)));
    const editing = useRef(false);

    useEffect(() => {
        if (!editing.current) setDraft(value == null ? '' : String(value));
    }, [value]);

    return (
        <input
            type="number"
            inputMode="decimal"
            value={draft}
            min={min}
            max={max}
            step={step}
            className={`${className}${invalid ? ' border-danger text-danger fw-semibold' : ''}`}
            style={style}
            disabled={disabled}
            onFocus={() => { editing.current = true; }}
            onChange={(e) => {
                setDraft(e.target.value);
                const n = parseFloat(e.target.value);
                if (Number.isFinite(n)) onCommit(n);
            }}
            onBlur={() => {
                editing.current = false;
                // Re-sync from the model — reflects any clamping (e.g. discount
                // capped at 40, qty floored at 1) and restores a value if the
                // teller left the field blank.
                setDraft(value == null ? '' : String(value));
            }}
        />
    );
}

/** Resolve the best thumbnail for a SaleItem. Prefers product.logo, falls
 *  back to the first image in product.gallery. Returns null for ad-hoc
 *  (non-stock) custom items or products without media. */
function saleItemThumbUrl(item) {
    const stockItem = typeof item?.first === 'function' ? item.first() : null;
    const product = stockItem?.product;
    if (!product) return null;
    const pick = (file) => {
        if (!file || !isImage(file)) return null;
        const thumb = file.formats?.thumbnail || file;
        return StraipImageUrl(thumb);
    };
    return pick(product.logo)
        || pick(Array.isArray(product.gallery) ? product.gallery.find(isImage) : null);
}

export default function SalesItemsList({
    items,
    onUpdate,
    onRemove,
    disabled = false
}) {
    if (items.length === 0) return null;

    return (
        <div className="table-responsive">
            <table className="table table-sm table-hover align-middle mb-0">
                <thead className="table-light">
                    <tr>
                        <th>#</th>
                        <th width="48"></th>
                        <th>Item</th>
                        <th width="140">Unit Price</th>
                        <th width="70" className="text-center">Qty</th>
                        <th width="150">Discount / Offer</th>
                        <th width="130" className="text-end">Row Total</th>
                        <th width="40"></th>
                    </tr>
                </thead>

                <tbody>
                    {items.map((item, index) => {
                        const thumbUrl = saleItemThumbUrl(item);
                        return (
                        <tr key={index}>
                            {/* # */}
                            <td className="text-muted small">{index + 1}</td>

                            {/* THUMB */}
                            <td>
                                <div
                                    className="d-flex align-items-center justify-content-center bg-white border rounded"
                                    style={{ width: 40, height: 40, overflow: 'hidden' }}
                                >
                                    {thumbUrl ? (
                                        <img
                                            src={thumbUrl}
                                            alt=""
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                        />
                                    ) : (
                                        <i className="fas fa-box text-muted" style={{ fontSize: 14, opacity: 0.4 }}></i>
                                    )}
                                </div>
                            </td>

                            {/* NAME */}
                            <td>
                                {item.isDynamicStock ? (
                                    <strong>{item.name}</strong>
                                ) : (
                                    <input
                                        className="form-control form-control-sm"
                                        value={item.name}
                                        onChange={e =>
                                            onUpdate(index, i =>
                                                i.setName(e.target.value)
                                            )
                                        }
                                        disabled={disabled}
                                    />
                                )}
                            </td>

                            {/* UNIT PRICE */}
                            <td>
                                {item.isDynamicStock ? (
                                    <div className="d-flex align-items-center">
                                        <span className={item.discount_percentage > 0 ? 'text-decoration-line-through text-muted small' : ''}>
                                            {(item.unitPrice ?? 0).toFixed(2)}
                                        </span>
                                        {item.discount_percentage > 0 && (
                                            <span className="ms-2 fw-semibold">
                                                {(item.unitDicountedPrice ?? 0).toFixed(2)}
                                            </span>
                                        )}
                                    </div>
                                ) : (
                                    <div className="d-flex align-items-center">
                                        <NumberCell
                                            className="form-control form-control-sm"
                                            value={item.unitPrice ?? 0}
                                            min={0}
                                            onCommit={n =>
                                                onUpdate(index, i =>
                                                    i.setSellingPrice(n)
                                                )
                                            }
                                            disabled={disabled}
                                        />
                                        {item.discount_percentage > 0 && (
                                            <span className="ms-2 fw-semibold small">
                                                {(item.unitDicountedPrice ?? 0).toFixed(2)}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </td>

                            {/* QTY — custom (non-stock) lines cap at MAX_CUSTOM_QTY
                                 and turn red past CUSTOM_QTY_WARN so the teller
                                 sees the limit approaching. */}
                            <td>
                                {(() => {
                                    const isCustom = !item.isDynamicStock;
                                    const qtyWarn = isCustom && item.quantity > CUSTOM_QTY_WARN;
                                    return (
                                        <>
                                            <NumberCell
                                                className="form-control form-control-sm text-center"
                                                value={item.quantity}
                                                min={1}
                                                step={1}
                                                max={isCustom ? MAX_CUSTOM_QTY : undefined}
                                                invalid={qtyWarn}
                                                onCommit={n =>
                                                    onUpdate(index, i =>
                                                        i.setQuantity(n)
                                                    )
                                                }
                                                disabled={disabled}
                                            />
                                            {qtyWarn && (
                                                <div className="text-danger text-center mt-1" style={{ fontSize: 10, lineHeight: 1.1 }}>
                                                    {item.quantity >= MAX_CUSTOM_QTY ? `Max ${MAX_CUSTOM_QTY} reached` : `Max ${MAX_CUSTOM_QTY}`}
                                                </div>
                                            )}
                                        </>
                                    );
                                })()}
                            </td>

                            {/* DISCOUNT / OFFER */}
                            <td>
                                <div className="d-flex gap-1 align-items-center">
                                    <NumberCell
                                        className="form-control form-control-sm"
                                        value={item.discount_percentage}
                                        min={0}
                                        step={1}
                                        onCommit={n =>
                                            onUpdate(index, i =>
                                                i.setDiscountPercent(n)
                                            )
                                        }
                                        disabled={disabled}
                                        style={{ width: 60 }}
                                    />
                                    <span className="text-muted small">%</span>
                                    {!item.offerActive ? (
                                        <button
                                            className="btn btn-sm btn-outline-success py-0 px-1"
                                            title="Apply offer price"
                                            onClick={() =>
                                                onUpdate(index, i => i.applyOfferPrice())
                                            }
                                            disabled={disabled}
                                        >
                                            <i className="fas fa-tag"></i>
                                        </button>
                                    ) : (
                                        <button
                                            className="btn btn-sm btn-outline-danger py-0 px-1"
                                            title="Revert offer"
                                            onClick={() =>
                                                onUpdate(index, i => i.revertOffer())
                                            }
                                            disabled={disabled}
                                        >
                                            <i className="fas fa-undo"></i>
                                        </button>
                                    )}
                                </div>
                            </td>

                            {/* TOTAL */}
                            <td className="text-end">
                                <span className={item.discount_percentage > 0 ? 'text-decoration-line-through text-muted small me-1' : 'fw-semibold'}>
                                    {item.subtotal.toFixed(2)}
                                </span>
                                {item.discount_percentage > 0 && (
                                    <span className="fw-semibold">
                                        {item.dicountedSubtotal.toFixed(2)}
                                    </span>
                                )}
                            </td>

                            {/* ACTIONS */}
                            <td className="text-center">
                                <button
                                    className="btn btn-sm btn-outline-danger py-0 px-1"
                                    onClick={() => onRemove(index)}
                                    disabled={disabled}
                                    title="Remove"
                                >
                                    <i className="fas fa-times"></i>
                                </button>
                            </td>
                        </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
