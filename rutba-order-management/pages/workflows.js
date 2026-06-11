import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import PermissionCheck from "@rutba/pos-shared/components/PermissionCheck";
import WorkflowEditor from "@rutba/pos-shared/components/workflow/WorkflowEditor";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { WorkflowsEndpoints } from "@rutba/api-provider/endpoints";

const ENTITIES = [
    {
        uid: "api::sale-order.sale-order",
        label: "Sale Order",
        statuses: [
            "PENDING_PAYMENT", "PAYMENT_CONFIRMED", "PREPARING", "AWAITING_PICKUP",
            "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "FAILED_DELIVERY",
            "RETURN_REQUESTED", "RETURN_IN_TRANSIT", "RETURNED", "REFUND_INITIATED", "REFUNDED",
        ],
    },
    {
        uid: "api::return-request.return-request",
        label: "Return Request",
        statuses: [
            "REQUESTED", "APPROVED", "REJECTED", "AWAITING_PICKUP",
            "RECEIVED", "COMPLETED", "CANCELLED",
        ],
    },
];

export default function Workflows() {
    const { jwt } = useAuth();
    return (
        <ProtectedRoute>
            <Layout>
                <PermissionCheck adminOnly>
                    <WorkflowEditor endpoints={WorkflowsEndpoints} entities={ENTITIES} jwt={jwt} />
                </PermissionCheck>
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() { return { props: {} }; }
