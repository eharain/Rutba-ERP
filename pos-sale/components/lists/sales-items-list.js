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
                        <th>Item</th>
                        <th width="140">Unit Price</th>
                        <th width="70" className="text-center">Qty</th>
                        <th width="150">Discount / Offer</th>
                        <th width="130" className="text-end">Row Total</th>
                        <th width="40"></th>
                    </tr>
                </thead>

                <tbody>
                    {items.map((item, index) => (
                        <tr key={index}>
                            {/* # */}
                            <td className="text-muted small">{index + 1}</td>

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
                                        <input
                                            type="number"
                                            className="form-control form-control-sm"
                                            value={item.unitPrice ?? 0}
                                            onChange={e =>
                                                onUpdate(index, i =>
                                                    i.setSellingPrice(+e.target.value)
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

                            {/* QTY */}
                            <td>
                                <input
                                    type="number"
                                    min="1"
                                    className="form-control form-control-sm text-center"
                                    value={item.quantity}
                                    onChange={e =>
                                        onUpdate(index, i =>
                                            i.setQuantity(+e.target.value)
                                        )
                                    }
                                    disabled={disabled}
                                />
                            </td>

                            {/* DISCOUNT / OFFER */}
                            <td>
                                <div className="d-flex gap-1 align-items-center">
                                    <input
                                        type="number"
                                        className="form-control form-control-sm"
                                        value={item.discount_percentage}
                                        min="0"
                                        max="100"
                                        onChange={e =>
                                            onUpdate(index, i =>
                                                i.setDiscountPercent(+e.target.value)
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
                    ))}
                </tbody>
            </table>
        </div>
    );
}
