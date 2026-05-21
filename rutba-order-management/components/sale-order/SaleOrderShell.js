import { useRouter } from "next/router";
import Link from "next/link";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { useToast } from "../Toast";
import { useSaleOrder } from "./hooks/useSaleOrder";
import StageStepper from "./StageStepper";
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

export default function SaleOrderShell() {
  const router = useRouter();
  const { documentId } = router.query;
  const { jwt } = useAuth();
  const { toast, ToastContainer } = useToast();

  const isNew = !documentId || documentId === "new";
  const { order, activeReturn, loading, riders, productsCatalog, refresh } = useSaleOrder({
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
          {!isNew && order && <StageStepper status={order.order_status} />}
          {renderStage()}
        </>
      )}
    </>
  );
}
