import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import PermissionCheck from "@rutba/pos-shared/components/PermissionCheck";
import WorkflowEditor from "@rutba/pos-shared/components/workflow/WorkflowEditor";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { WorkflowsEndpoints } from "@rutba/api-provider/endpoints";

const ENTITIES = [
    {
        uid: "api::mfg-work-order.mfg-work-order",
        label: "Work Order",
        statuses: ["Draft", "Released", "InProgress", "OnHold", "Completed", "Cancelled"],
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
