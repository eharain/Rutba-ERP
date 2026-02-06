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
                    <th width="110">Unit Price</th>
                    <th width="70">Quantity</th>
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
                                ((item.unitPrice ?? 0).toFixed(2))
                            ) : (
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
                            )} / {(item.unitDicountedPrice ?? 0).toFixed(2)}
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

                        {/* DISCOUNT */}
                        <td>
                            <input
                                type="number"
                                className="form-control"
                                value={item.discount_percentage}
                                min="0"
                                max="100"
                                //disabled={item.discount}
                                onChange={e =>
                                    onUpdate(index, i =>
                                        i.setDiscountPercent(+e.target.value)
                                    )
                                }
                                disabled={disabled}
                            />
                        </td>

                        {/* TOTAL */}
                        <td>{item.subtotal.toFixed(2)} / {item.dicountedSubtotal.toFixed(2)}</td>

                        {/* ACTIONS */}
                        <td className="d-flex gap-1">
                            {/*s{item.sellingPrice} d{item.dicount} c{item.costPrice} p{item.price}*/}
                            {!item.offerActive ? (
                                <button
                                    className="btn btn-sm btn-outline-success"
                                    title="Apply offer price"
                                    onClick={() =>
                                        onUpdate(index, i => i.applyOfferPrice())
                                    }
                                    disabled={disabled}
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
                                    disabled={disabled}
                                >
                                    Offer+
                                </button>
                            )}

                            <button
                                className="btn btn-sm btn-danger"
                                onClick={() => onRemove(index)}
                                disabled={disabled}
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
