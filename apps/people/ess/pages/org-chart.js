import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/shared/components/ProtectedRoute";
import OrgChart from "@rutba/shared/components/OrgChart";

/**
 * Employee-facing view of where they sit. The server roots the tree on the
 * caller and adds their chain upward, so there is nothing to scope here — the
 * same component simply receives a smaller tree.
 */
export default function OrgChartPage() {
    return (
        <ProtectedRoute>
            <Layout>
                <h2 className="mb-1">Where I Sit</h2>
                <p className="text-muted small mb-3">
                    Your place in the organisation — who you report to, and who reports to you.
                </p>
                <div className="card">
                    <div className="card-body">
                        <OrgChart defaultView="reporting" />
                    </div>
                </div>
            </Layout>
        </ProtectedRoute>
    );
}
