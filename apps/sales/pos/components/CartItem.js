export default function CartItem({ item, onRemove, onQty }) {
  const name = item?.name || 'no name loaded';
  const price = item?.selling_price ?? -.01;
  const qty = item.__qty || 1;
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", borderBottom: "1px solid #eee", padding: "8px 0" }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600 }}>{name}</div>
        <div>${price} x {qty} = <b>${(price * qty).toFixed(2)}</b></div>
      </div>
      <input type="number" min={1} value={qty} onChange={(e)=>onQty(+e.target.value)} style={{ width: 80 }} />
      <button onClick={onRemove}>Remove</button>
    </div>
  );
}
