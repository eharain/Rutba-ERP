import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/shared/components/ProtectedRoute";
import LowStockAlertsPanel from "@rutba/shared/components/LowStockAlertsPanel";

// Persisted low-stock alert queue (daily cron + reorder engine). Acknowledge /
// dismiss / run-now. Shared panel.
export default function AlertsPage() {
    return (
        <ProtectedRoute>
            <Layout>
                <LowStockAlertsPanel />
            </Layout>
        </ProtectedRoute>
    );
}
