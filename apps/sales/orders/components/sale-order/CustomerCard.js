// Shipping + contact info. Editable in DraftStage; locked everywhere else
// (you don't relabel a package after dispatch). `readOnly` swaps inputs for
// plain text so the same component renders the summary on later stages.
export default function CustomerCard({ value, onChange, readOnly = false, orderId }) {
  const Field = ({ label, name, type = "text", colClass = "col-md-3" }) => (
    <div className={colClass}>
      <label className="form-label text-muted small mb-0">{label}</label>
      {readOnly ? (
        <div className="fw-semibold">{value[name] || <span className="text-muted">—</span>}</div>
      ) : (
        <input
          className="form-control"
          type={type}
          value={value[name] || ""}
          onChange={(e) => onChange({ ...value, [name]: e.target.value })}
          required
        />
      )}
    </div>
  );

  return (
    <div className="card mb-4">
      <div className="card-header bg-light fw-semibold">
        <i className="fas fa-truck me-2" />
        Customer &amp; Delivery
        {orderId && (
          <span className="text-muted ms-2 small">· Order {orderId}</span>
        )}
      </div>
      <div className="card-body">
        <div className="row g-3">
          <Field label="Customer Name" name="name" />
          <Field label="Phone" name="phone" colClass="col-md-2" />
          <Field label="Email" name="email" type="email" />
          <Field label="Address" name="line1" colClass="col-md-4" />
          <Field label="State" name="state" colClass="col-md-2" />
          <Field label="City" name="city" colClass="col-md-2" />
          <Field label="Zip Code" name="zip_code" colClass="col-md-2" />
          <Field label="Country" name="country" colClass="col-md-2" />
        </div>
      </div>
    </div>
  );
}
