import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { authApi } from "@rutba/pos-shared/lib/api";
import { useToast } from "../../components/Toast";

const PROVIDERS = ["own_rider", "easypost", "custom"];

export default function DeliveryMethodDetailPage() {
  const router = useRouter();
  const { documentId } = router.query;
  const { jwt } = useAuth();
  const { toast, ToastContainer } = useToast();

  const isNew = documentId === "new";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [serviceProvider, setServiceProvider] = useState("own_rider");
  const [baseCost, setBaseCost] = useState("0");
  const [perKgRate, setPerKgRate] = useState("0");
  const [freeShippingThreshold, setFreeShippingThreshold] = useState("");
  const [estimatedDaysMin, setEstimatedDaysMin] = useState("1");
  const [estimatedDaysMax, setEstimatedDaysMax] = useState("3");
  const [priority, setPriority] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [offerTimeoutMinutes, setOfferTimeoutMinutes] = useState("5");
  const [maxRidersToOffer, setMaxRidersToOffer] = useState("10");

  useEffect(() => {
    if (!jwt || !documentId) return;
    if (isNew) {
      setLoading(false);
      return;
    }

    authApi
      .get(`/delivery-methods/${documentId}`)
      .then((res) => {
        const m = res.data || res;
        setName(m.name || "");
        setDescription(m.description || "");
        setServiceProvider(m.service_provider || "own_rider");
        setBaseCost(String(m.base_cost ?? 0));
        setPerKgRate(String(m.per_kg_rate ?? 0));
        setFreeShippingThreshold(m.free_shipping_threshold == null ? "" : String(m.free_shipping_threshold));
        setEstimatedDaysMin(String(m.estimated_days_min ?? 1));
        setEstimatedDaysMax(String(m.estimated_days_max ?? 3));
        setPriority(String(m.priority ?? 0));
        setIsActive(m.is_active !== false);
        setOfferTimeoutMinutes(String(m.offer_timeout_minutes ?? 5));
        setMaxRidersToOffer(String(m.max_riders_to_offer ?? 10));
      })
      .catch((err) => {
        console.error("Failed to load delivery method", err);
        toast("Failed to load delivery method.", "danger");
      })
      .finally(() => setLoading(false));
  }, [jwt, documentId, isNew, toast]);

  const buildPayload = () => ({
    data: {
      name: name.trim(),
      description: description.trim() || null,
      service_provider: serviceProvider,
      base_cost: Number(baseCost || 0),
      per_kg_rate: Number(perKgRate || 0),
      free_shipping_threshold: freeShippingThreshold === "" ? null : Number(freeShippingThreshold),
      estimated_days_min: Number(estimatedDaysMin || 1),
      estimated_days_max: Number(estimatedDaysMax || 3),
      priority: Number(priority || 0),
      is_active: isActive,
      offer_timeout_minutes: Number(offerTimeoutMinutes || 5),
      max_riders_to_offer: Number(maxRidersToOffer || 10),
    },
  });

  const handleSave = async () => {
    if (!name.trim()) {
      toast("Delivery method name is required.", "warning");
      return;
    }

    setSaving(true);
    try {
      if (isNew) {
        const res = await authApi.post("/delivery-methods", buildPayload());
        const created = res.data || res;
        toast("Delivery method created.", "success");
        router.push(`/${created.documentId}/delivery-method`);
      } else {
        await authApi.put(`/delivery-methods/${documentId}`, buildPayload());
        toast("Delivery method updated.", "success");
      }
    } catch (err) {
      console.error("Failed to save delivery method", err);
      toast("Failed to save delivery method.", "danger");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProtectedRoute>
      <Layout>
        <ToastContainer />

        <div className="d-flex align-items-center mb-3">
          <Link className="btn btn-sm btn-outline-secondary me-3" href="/delivery-methods">
            <i className="fas fa-arrow-left"></i> Back
          </Link>
          <h2 className="mb-0">{isNew ? "New Delivery Method" : "Edit Delivery Method"}</h2>
          <div className="ms-auto d-flex gap-2">
            <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : isNew ? "Create Delivery Method" : "Save Delivery Method"}
            </button>
          </div>
        </div>

        {loading && <p>Loading...</p>}

        {!loading && (
          <div className="card">
            <div className="card-body">
              <div className="row g-3">
                <div className="col-md-6">
                  <label className="form-label">Name</label>
                  <input className="form-control" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>

                <div className="col-md-6">
                  <label className="form-label">Description</label>
                  <input className="form-control" value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>

                <div className="col-md-3">
                  <label className="form-label">Provider</label>
                  <select className="form-select" value={serviceProvider} onChange={(e) => setServiceProvider(e.target.value)}>
                    {PROVIDERS.map((provider) => (
                      <option key={provider} value={provider}>{provider}</option>
                    ))}
                  </select>
                </div>

                <div className="col-md-3">
                  <label className="form-label">Base Cost</label>
                  <input
                    className="form-control"
                    type="number"
                    min="0"
                    step="0.01"
                    value={baseCost}
                    onChange={(e) => setBaseCost(e.target.value)}
                  />
                </div>

                <div className="col-md-3">
                  <label className="form-label">Per Kg Rate</label>
                  <input
                    className="form-control"
                    type="number"
                    min="0"
                    step="0.01"
                    value={perKgRate}
                    onChange={(e) => setPerKgRate(e.target.value)}
                  />
                </div>

                <div className="col-md-3">
                  <label className="form-label">Free Shipping Threshold</label>
                  <input
                    className="form-control"
                    type="number"
                    min="0"
                    step="0.01"
                    value={freeShippingThreshold}
                    onChange={(e) => setFreeShippingThreshold(e.target.value)}
                  />
                </div>

                <div className="col-md-2">
                  <label className="form-label">Min Days</label>
                  <input
                    className="form-control"
                    type="number"
                    min="0"
                    value={estimatedDaysMin}
                    onChange={(e) => setEstimatedDaysMin(e.target.value)}
                  />
                </div>

                <div className="col-md-2">
                  <label className="form-label">Max Days</label>
                  <input
                    className="form-control"
                    type="number"
                    min="0"
                    value={estimatedDaysMax}
                    onChange={(e) => setEstimatedDaysMax(e.target.value)}
                  />
                </div>

                <div className="col-md-2">
                  <label className="form-label">Priority</label>
                  <input
                    className="form-control"
                    type="number"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                  />
                </div>

                <div className="col-md-3">
                  <label className="form-label">Offer Timeout (Minutes)</label>
                  <input
                    className="form-control"
                    type="number"
                    min="1"
                    value={offerTimeoutMinutes}
                    onChange={(e) => setOfferTimeoutMinutes(e.target.value)}
                  />
                </div>

                <div className="col-md-3">
                  <label className="form-label">Max Riders To Offer</label>
                  <input
                    className="form-control"
                    type="number"
                    min="1"
                    value={maxRidersToOffer}
                    onChange={(e) => setMaxRidersToOffer(e.target.value)}
                  />
                </div>

                <div className="col-12">
                  <div className="form-check">
                    <input
                      id="is-active"
                      className="form-check-input"
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="is-active">Active</label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </Layout>
    </ProtectedRoute>
  );
}
