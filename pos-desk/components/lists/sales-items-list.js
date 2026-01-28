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
                    <th width="120">Price</th>
                    <th width="120">Total</th>
                    <th width="50"></th>
                </tr>
            </thead>
            <tbody>
                {items.map((item, index) => (
                    <tr key={index}>
                        <td>{item.name}</td>
                        <td>
                            <input
                                type="number"
                                value={item.quantity}
                                min="1"
                                className="form-control"
                                onChange={e =>
                                    onUpdate(index, i =>
                                        i.setQuantity(+e.target.value)
                                    )
                                }
                            />
                        </td>
                        <td>{item.unitNetPrice.toFixed(2)}</td>
                        <td>{item.total.toFixed(2)}</td>
                        <td>
                            <button
                                className="btn btn-danger btn-sm"
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
