export default function SalesItemsList({
    items,
    onUpdate,
    onRemove,
    disabled = false
}) {
    return (
        <table className="table table-bordered mt-3">
            <thead>
                <tr>
                    <th>Item</th>
                    <th width="160">Unit Price</th>
                    <th width="70">Quantity</th>
                    <th width="160">Discount / Offer</th>
                    <th width="160">Row Total</th>
                    <th width="50">Actions</th>
                </tr>
            </thead>

            <tbody>
                {items.map((item, index) => (
                    <tr key={index}>
                        {/* NAME */}
                        <td>
                            {item.isDynamicStock ? (
                                <strong>{item.name}</strong>
                            ) : (
                                <input
                                    className="form-control"
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
                                    <span className={item.discount_percentage > 0 ? 'text-decoration-line-through text-muted' : ''}>
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
                                        className="form-control"
                                        value={item.unitPrice ?? 0}
                                        onChange={e =>
                                            onUpdate(index, i =>
                                                i.setSellingPrice(+e.target.value)
                                            )
                                        }
                                        disabled={disabled}
                                    />
                                    {item.discount_percentage > 0 && (
                                        <span className="ms-2 fw-semibold">
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
                                className="form-control"
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
                            <div className="d-flex gap-2">
                                <input
                                    type="number"
                                    className="form-control"
                                    value={item.discount_percentage}
                                    min="0"
                                    max="100"
                                    onChange={e =>
                                        onUpdate(index, i =>
                                            i.setDiscountPercent(+e.target.value)
                                        )
                                    }
                                    disabled={disabled}
                                />
                                {!item.offerActive ? (
                                    <button
                                        className="btn btn-sm btn-outline-success"
                                        title="Apply offer price"
                                        onClick={() =>
                                            onUpdate(index, i => i.applyOfferPrice())
                                        }
                                        disabled={disabled}
                                    >
                                        <i className="fas fa-tag me-1"></i>Offer
                                    </button>
                                ) : (
                                    <button
                                        className="btn btn-sm btn-outline-danger"
                                        title="Revert offer"
                                        onClick={() =>
                                            onUpdate(index, i => i.revertOffer())
                                        }
                                        disabled={disabled}
                                    >
                                        <i className="fas fa-undo me-1"></i>Revert
                                    </button>
                                )}
                            </div>
                        </td>

                        {/* TOTAL */}
                        <td>
                            <div className="d-flex align-items-center">
                                <span className={item.discount_percentage > 0 ? 'text-decoration-line-through text-muted' : ''}>
                                    {item.subtotal.toFixed(2)}
                                </span>
                                {item.discount_percentage > 0 && (
                                    <span className="ms-2 fw-semibold">
                                        {item.dicountedSubtotal.toFixed(2)}
                                    </span>
                                )}
                            </div>
                        </td>

                        {/* ACTIONS */}
                        <td>
                            <button
                                className="btn btn-sm btn-danger"
                                onClick={() => onRemove(index)}
                                disabled={disabled}
                            >
                                <i className="fas fa-trash"></i>
                            </button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
