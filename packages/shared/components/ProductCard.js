export default function ProductCard({ product, onAdd }) {
  const name = product?.name || product?.attributes?.name;
  const price = product?.selling_price ?? product?.attributes?.selling_price ?? 0;

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, margin: 8, width: 220 }}>
      <h3 style={{ margin: 0, marginBottom: 8 }}>{name}</h3>
      <div style={{ marginBottom: 8 }}>Price: <b>${price}</b></div>
      <button onClick={onAdd}>Add</button>
    </div>
  );
}
