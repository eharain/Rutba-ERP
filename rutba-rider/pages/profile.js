import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";

const STATUS_OPTIONS = ["available", "off_duty"];

export default function ProfilePage() {
  const { jwt } = useAuth();
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState("off_duty");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = () => {
    if (!jwt) return;
    authApi.get('/rider/me', {}, jwt)
      .then((res) => {
        const data = res.data || res;
        setProfile(data);
        setStatus(data?.status || 'off_duty');
      })
      .catch((err) => console.error('Failed to load rider profile', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [jwt]);

  const updateStatus = async () => {
    if (!jwt) return;
    try {
      setSaving(true);
      await authApi.put('/rider/me/status', { status }, jwt);
      load();
    } catch (err) {
      alert(err?.response?.data?.error?.message || 'Failed to update status');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProtectedRoute>
      <Layout>
        <h2 className="mb-3">Rider Profile</h2>

        {loading && <p>Loading profile...</p>}

        {!loading && !profile && (
          <div className="alert alert-warning">Rider profile not found.</div>
        )}

        {!loading && profile && (
          <div className="card">
            <div className="card-body">
              <p><strong>Name:</strong> {profile.full_name || '—'}</p>
              <p><strong>Phone:</strong> {profile.phone || '—'}</p>
              <p><strong>Vehicle:</strong> {profile.vehicle_type || '—'}</p>
              <p><strong>Total Completed:</strong> {profile.total_deliveries_completed || 0}</p>
              <p><strong>Rating:</strong> {profile.rating || '—'}</p>

              <div className="d-flex gap-2 align-items-center mt-3">
                <select className="form-select" value={status} onChange={(e) => setStatus(e.target.value)}>
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <button className="btn btn-primary" onClick={updateStatus} disabled={saving}>
                  {saving ? 'Saving...' : 'Update Status'}
                </button>
              </div>
            </div>
          </div>
        )}
      </Layout>
    </ProtectedRoute>
  );
}
