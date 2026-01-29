export default function SalesItemsList({
    items,
    onUpdate,
    onRemove
}) {
    return (
        <table className="table table-bordered mt-3">
            <thead>
                <tr>
                    <th>Item</th>
                    <th width="70">Qty</th>
                    <th width="110">Unit</th>
                    <th width="90">Disc %</th>
                    <th width="130">Row Total</th>
                    <th width="140">Actions</th>
                </tr>
            </thead>

            <tbody>
                {items.map((item, index) => (
                    <tr key={index}>
                        {/* NAME */}
                        <td>
                            {item.isStockItem ? (
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
                                />
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
                            />
                        </td>

                        {/* UNIT PRICE */}
                        <td>
                            {item.isStockItem ? (
                                item.unitNetPrice.toFixed(2)
                            ) : (
                                <input
                                    type="number"
                                    className="form-control"
                                    value={item.sellingPrice}
                                    onChange={e =>
                                        onUpdate(index, i =>
                                            i.setSellingPrice(+e.target.value)
                                        )
                                    }
                                />
                            )}
                        </td>

                        {/* DISCOUNT */}
                        <td>
                            <input
                                type="number"
                                className="form-control"
                                value={item.discountPercent}
                                min="0"
                                disabled={item.offerActive}
                                onChange={e =>
                                    onUpdate(index, i =>
                                        i.setDiscountPercent(+e.target.value)
                                    )
                                }
                            />
                        </td>

                        {/* TOTAL */}
                        <td>{item.total.toFixed(2)}</td>

                        {/* ACTIONS */}
                        <td className="d-flex gap-1">
                            {!item.offerActive ? (
                                <button
                                    className="btn btn-sm btn-outline-success"
                                    title="Apply offer price"
                                    onClick={() =>
                                        onUpdate(index, i =>
                                            i.applyOfferPrice(i.offerPrice)
                                        )
                                    }
                                >
                                    Offer-
                                </button>
                            ) : (
                                <button
                                    className="btn btn-sm btn-outline-danger"
                                    title="Revert offer"
                                    onClick={() =>
                                        onUpdate(index, i => i.revertOffer())
                                    }
                                >
                                    Offer+
                                </button>
                            )}

                            <button
                                className="btn btn-sm btn-danger"
                                onClick={() => onRemove(index)}
                            >
                                ✕
                            </button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
