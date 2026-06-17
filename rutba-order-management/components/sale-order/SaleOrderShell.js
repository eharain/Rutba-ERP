import { useRouter } from "next/router";
import Link from "next/link";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { useToast } from "../Toast";
import { useState } from "react";
import { useSaleOrder, isCustomWorkflow, workflowStage } from "./hooks/useSaleOrder";
import { SaleOrdersEndpoints } from "@rutba/api-provider/endpoints/index.js";
import PermissionCheck from "@rutba/pos-shared/components/PermissionCheck";
import WorkflowViewer from "@rutba/pos-shared/components/workflow/WorkflowViewer";
import WorkItemPanel from "@rutba/pos-shared/components/workflow/WorkItemPanel";
import StageStepper from "./StageStepper";

const SO_ENTITY_UID = "api::sale-order.sale-order";
import DraftStage from "./stages/DraftStage";
import DeliveryMethodStage from "./stages/DeliveryMethodStage";
import PaymentStage from "./stages/PaymentStage";
import VerificationStage from "./stages/VerificationStage";
import PreparationStage from "./stages/PreparationStage";
import PickupStage from "./stages/PickupStage";
import DeliveryStage from "./stages/DeliveryStage";
import FailedStage from "./stages/FailedStage";
import SettledStage from "./stages/SettledStage";
import CancelledStage from "./stages/CancelledStage";
import ReturnStage from "./stages/ReturnStage";

// Stage routing rules. The order's `order_status` picks the panel; there are
// two early-stage nuances:
//   - PENDING_PAYMENT with no items   → DRAFT (capture customer + items)
//   - PENDING_PAYMENT with items but
//     no delivery method               → DELIVERY_METHOD (gate)
//   - PENDING_PAYMENT with both        → PAYMENT
//   - PAYMENT_CONFIRMED                → VERIFICATION (skipped for COD via
//                                        delivery_method.supports_cod; the
//                                        stage itself ungates Start Preparing
//                                        when the order is COD)
function pickStage(order, isNew) {
  if (isNew || !order) return "DRAFT";
  const status = order.order_status || "PENDING_PAYMENT";

  switch (status) {
    case "PENDING_PAYMENT": {
      const hasItems = (order.products?.items || []).length > 0;
      if (!hasItems) return "DRAFT";
      if (!order.delivery_method) return "DELIVERY_METHOD";
      return "PAYMENT";
    }
    case "PAYMENT_CONFIRMED":
      return "VERIFICATION";
    case "PREPARING":
      return "PREPARATION";
    case "AWAITING_PICKUP":
      return "PICKUP";
    case "OUT_FOR_DELIVERY":
      return "DELIVERY";
    case "FAILED_DELIVERY":
      return "FAILED";
    case "DELIVERED":
      return "SETTLED";
    case "RETURN_REQUESTED":
    case "RETURN_IN_TRANSIT":
    case "RETURNED":
      return "RETURN";
    case "CANCELLED":
    case "REFUND_INITIATED":
    case "REFUNDED":
      return "CANCELLED";
    default:
      return "DRAFT";
  }
}

// Visual workflow map + (for customised workflows) stage-move buttons.
// The seeded 1:1 mirror renders map-only, collapsed by default — the stage
// panels below own its actions (payment recording, rider assignment, …).
// Custom moves run through POST /update-status; the server resolves the
// stage key, validates it against the workflow graph, and fires canonical
// side effects only when the mapped status actually changes.
function WorkflowMovesCard({ order, workflow, toast, refresh }) {
  const [busy, setBusy] = useState(false);
  const custom = isCustomWorkflow(workflow);
  const [open, setOpen] = useState(custom);
  const current = workflowStage(workflow, order);

  async function move(toKey) {
    setBusy(true);
    try {
      await SaleOrdersEndpoints.updateStatus(order.documentId, { status: toKey });
      toast?.("Stage updated.", "success");
      await refresh();
    } catch (err) {
      const msg = err?.response?.data?.error?.message || err?.message || "Stage change failed.";
      toast?.(msg, "danger");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mb-3">
      <div className="card-header d-flex justify-content-between align-items-center">
        <span role="button" onClick={() => setOpen((o) => !o)}>
          <i className={`fas fa-chevron-${open ? "down" : "right"} me-2 small`} />
          <i className="fas fa-diagram-project me-2" />
          Workflow — {workflow.name}
          {current && (
            <span className={`badge ms-2 bg-${current.color || "primary"}`}>
              {current.name || current.key}
            </span>
          )}
        </span>
        <PermissionCheck showIf="admin">
          <Link href="/workflows" className="small">Edit workflows</Link>
        </PermissionCheck>
      </div>
      {open && (
        <div className="card-body">
          <WorkflowViewer
            workflow={workflow}
            currentKey={order.stage_key}
            currentStatus={order.order_status}
            onTransition={custom ? move : undefined}
            busy={busy}
            height={260}
          />
          {!custom && (
            <div className="text-muted small mt-2">
              Standard lifecycle — use the action buttons in the stage panel below to progress the order.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SaleOrderShell() {
  const router = useRouter();
  const { documentId } = router.query;
  const { jwt, user } = useAuth();
  const { toast, ToastContainer } = useToast();

  const isNew = !documentId || documentId === "new";
  const { order, activeReturn, loading, riders, productsCatalog, refresh, workflow } = useSaleOrder({
    documentId,
    isNew,
    jwt,
    toast,
  });

  if (!router.isReady) return null;

  const stage = pickStage(order, isNew);

  const renderStage = () => {
    switch (stage) {
      case "DRAFT":
        return (
          <DraftStage
            order={order}
            isNew={isNew}
            productsCatalog={productsCatalog}
            toast={toast}
            onSaved={refresh}
          />
        );
      case "DELIVERY_METHOD":
        return <DeliveryMethodStage order={order} toast={toast} onRefresh={refresh} />;
      case "PAYMENT":
        return <PaymentStage order={order} riders={riders} toast={toast} onAdvanced={refresh} />;
      case "VERIFICATION":
        return (
          <VerificationStage
            order={order}
            productsCatalog={productsCatalog}
            toast={toast}
            onRefresh={refresh}
          />
        );
      case "PREPARATION":
        return (
          <PreparationStage
            order={order}
            productsCatalog={productsCatalog}
            toast={toast}
            onRefresh={refresh}
          />
        );
      case "PICKUP":
        return <PickupStage order={order} riders={riders} toast={toast} onRefresh={refresh} />;
      case "DELIVERY":
        return <DeliveryStage order={order} toast={toast} onRefresh={refresh} />;
      case "FAILED":
        return <FailedStage order={order} toast={toast} onRefresh={refresh} />;
      case "SETTLED":
        return <SettledStage order={order} riders={riders} toast={toast} onRefresh={refresh} />;
      case "RETURN":
        return <ReturnStage order={order} activeReturn={activeReturn} toast={toast} onRefresh={refresh} />;
      case "CANCELLED":
        return <CancelledStage order={order} toast={toast} onRefresh={refresh} />;
      default:
        return null;
    }
  };

  return (
    <>
      <ToastContainer />

      <div className="d-flex align-items-center mb-3">
        <Link className="btn btn-sm btn-outline-secondary me-3" href="/sale-orders">
          <i className="fas fa-arrow-left" /> Back
        </Link>
        <h2 className="mb-0">{isNew ? "New Sale Order" : "Sale Order"}</h2>
        {!isNew && order?.order_id && (
          <code className="ms-3 text-muted">{order.order_id}</code>
        )}
      </div>

      {loading && <p>Loading...</p>}

      {!loading && (
        <>
          {!isNew && order && (
            <StageStepper status={order.order_status} workflow={workflow} stageKey={order.stage_key} />
          )}
          {!isNew && order && workflow && (
            <WorkflowMovesCard order={order} workflow={workflow} toast={toast} refresh={refresh} />
          )}
          {renderStage()}
          {!isNew && order && (
            <WorkItemPanel
              entityUid={SO_ENTITY_UID}
              documentId={order.documentId}
              jwt={jwt}
              currentUserId={user?.id}
              assignee={order.assignee}
              onAssigned={refresh}
            />
          )}
        </>
      )}
    </>
  );
}
