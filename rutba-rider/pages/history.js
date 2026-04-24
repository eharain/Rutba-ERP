import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";

export default function HistoryPage() {
  const { jwt } = useAuth();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!jwt) return;
    authApi.get('/rider/deliveries?status=history', {}, jwt)
      .then((res) => setHistory(res.data || []))
      .catch((err) => console.error('Failed to load history', err))
      .finally(() => setLoading(false));
  }, [jwt]);

  const earnings = history.reduce((sum, d) => sum + Number(d.delivery_cost || 0), 0);

  return (
    <ProtectedRoute>
      <Layout>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h2 className="mb-0">Delivery History</h2>
          <span className="badge bg-success">Estimated Earnings: Rs. {earnings.toFixed(0)}</span>
        </div>

        {loading && <p>Loading history...</p>}
        {!loading && history.length === 0 && <div className="alert alert-info">No completed deliveries yet.</div>}

        {!loading && history.length > 0 && (
          <div className="table-responsive">
            <table className="table table-striped">
              <thead className="table-dark">
                <tr>
                  <th>Order</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Delivery Cost</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {history.map((d) => (
                  <tr key={d.id}>
                    <td>{d.order_id || d.documentId}</td>
                    <td>{d.order_status}</td>
                    <td>Rs. {Number(d.total || 0).toFixed(0)}</td>
                    <td>Rs. {Number(d.delivery_cost || 0).toFixed(0)}</td>
                    <td>{new Date(d.updatedAt || d.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Layout>
    </ProtectedRoute>
  );
}
