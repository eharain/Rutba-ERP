import { useState } from "react";
import { SaleOrdersEndpoints } from "@rutba/api-provider/endpoints/index.js";
import { serverMessage } from "./util";

// Banner shown when order.pending_cost_change is set — i.e. an admin has
// changed the total of an already-confirmed order and the customer hasn't
// yet re-approved. The banner is the UI surface across PaymentStage,
// VerificationStage, PreparationStage. Two staff actions live here:
//
//   - Resend Email: re-fires the same approval template (server reuses the
//     existing ack_token so older email links stay valid).
//   - Confirm via Phone: staff records they got verbal/written approval
//     out-of-band. Stamps acked_at + acked_via + ack_notes; the email link
//     is burned so the customer can't accidentally double-confirm.
//
// pending_cost_change shape:
//   { old_total, new_total, reason, requested_at, requested_by,
//     ack_required, ack_token, ack_url, last_email_sent_at,
//     acked_at, acked_by, acked_via, ack_notes }

function relativeTime(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diffMs = Date.now() - then;
  if (diffMs < 0) return "just now";
  const m = Math.round(diffMs / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

export default function CostChangeBanner({ order, toast, onRefresh }) {
  const change = order?.pending_cost_change;
  const [resending, setResending] = useState(false);
  const [overriding, setOverriding] = useState(false);
  const [showOverride, setShowOverride] = useState(false);
  const [via, setVia] = useState("phone");
  const [notes, setNotes] = useState("");

  if (!change || typeof change !== "object") return null;
  if (change.acked_at) return null;
  if (change.ack_required === false) return null;

  const oldTotal = Number(change.old_total ?? 0);
  const newTotal = Number(change.new_total ?? 0);
  const delta = newTotal - oldTotal;
  const reason = change.reason || "";
  const sentRel = relativeTime(change.last_email_sent_at || change.requested_at);

  const handleResend = async () => {
    setResending(true);
    try {
      await SaleOrdersEndpoints.requestCostChangeAck(order.documentId, {
        old_total: oldTotal,
        new_total: newTotal,
        reason,
      });
      toast?.("Approval email re-sent.", "success");
      await onRefresh?.();
    } catch (err) {
      console.error("Failed to resend approval email", err);
      toast?.(`Failed to resend: ${serverMessage(err)}`, "danger");
    } finally {
      setResending(false);
    }
  };

  const handleOverride = async () => {
    setOverriding(true);
    try {
      await SaleOrdersEndpoints.overrideCostChangeAck(order.documentId, {
        via,
        notes: notes.trim() || undefined,
      });
      toast?.(`Cost change confirmed via ${via}.`, "success");
      setShowOverride(false);
      setNotes("");
      await onRefresh?.();
    } catch (err) {
      console.error("Failed to override cost-change ack", err);
      toast?.(`Failed to override: ${serverMessage(err)}`, "danger");
    } finally {
      setOverriding(false);
    }
  };

  return (
    <div className="alert alert-warning small">
      <div className="d-flex align-items-start gap-2">
        <i className="fas fa-bell mt-1" />
        <div className="flex-grow-1">
          <div>
            <strong>Awaiting customer confirmation of cost change.</strong>{" "}
            Total moved from <strong>{oldTotal.toFixed(2)}</strong> to{" "}
            <strong>{newTotal.toFixed(2)}</strong>
            {" "}({delta >= 0 ? "+" : ""}
            {delta.toFixed(2)}).
            {reason && (
              <>
                {" "}Reason: <em>{reason}</em>.
              </>
            )}
            {sentRel && (
              <>
                {" "}Email sent <span className="text-muted">{sentRel}</span>.
              </>
            )}
          </div>
          <div className="text-muted mt-1">
            The order can't move into packaging until the customer clicks
            Confirm in the email, or staff records an out-of-band approval.
          </div>

          <div className="mt-2 d-flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-outline-warning btn-sm"
              onClick={handleResend}
              disabled={resending || overriding}
            >
              <i className="fas fa-envelope me-1" />
              {resending ? "Resending…" : "Resend Email"}
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => setShowOverride((v) => !v)}
              disabled={resending || overriding}
            >
              <i className="fas fa-phone me-1" />
              Confirm via Phone / Other
            </button>
          </div>

          {showOverride && (
            <div className="card mt-3">
              <div className="card-body">
                <div className="row g-2 mb-2">
                  <div className="col-md-3">
                    <label className="form-label small mb-0">Channel</label>
                    <select
                      className="form-select form-select-sm"
                      value={via}
                      onChange={(e) => setVia(e.target.value)}
                      disabled={overriding}
                    >
                      <option value="phone">Phone</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="in_person">In Person</option>
                      <option value="email">Email (manual)</option>
                    </select>
                  </div>
                  <div className="col-md-9">
                    <label className="form-label small mb-0">Notes</label>
                    <input
                      className="form-control form-control-sm"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder='e.g. "spoke with customer, confirmed new total + ETA"'
                      disabled={overriding}
                    />
                  </div>
                </div>
                <div className="d-flex justify-content-end gap-2">
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() => setShowOverride(false)}
                    disabled={overriding}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-success btn-sm"
                    onClick={handleOverride}
                    disabled={overriding}
                  >
                    <i className="fas fa-check me-1" />
                    {overriding ? "Recording…" : "Record Customer Approval"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
