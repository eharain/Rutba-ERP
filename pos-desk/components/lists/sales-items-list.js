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
                    <th width="80">Qty</th>
                    <th width="120">Unit Price</th>
                    <th width="90">Disc %</th>
                    <th width="120">Row Total</th>
                    <th width="60"></th>
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
                                        onUpdate(index, i => i.setName(e.target.value))
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
                        <td>
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
