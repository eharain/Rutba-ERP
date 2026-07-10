import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import Link from "next/link";

// Landing dashboard for the Inventory Management app. The backend Foundation
// (warehouses, storage-locations, stock-levels, stock-batches + the per-location
// stock-level cache) is live; these feature screens ship across the Inventory
// epics. Cards are informational until their screen lands.
const FEATURES = [
    { icon: "fa-warehouse",        border: "border-primary",   color: "text-primary",   title: "Warehouses & Locations", desc: "Manage warehouses and the storage-location (bin) hierarchy.", ready: true, href: "/warehouses" },
    { icon: "fa-layer-group",      border: "border-info",      color: "text-info",      title: "Stock by Location",      desc: "Per-(product, warehouse) on-hand levels, drilling into units.", ready: true, href: "/stock-levels" },
    { icon: "fa-right-left",       border: "border-success",   color: "text-success",   title: "Transfers",              desc: "Two-sided stock transfers between warehouses with in-transit tracking.", ready: true, href: "/transfers" },
    { icon: "fa-sliders",          border: "border-warning",   color: "text-warning",   title: "Adjustments",            desc: "Write-offs, damage, loss and expiry with best-effort GL posting.", ready: true, href: "/adjustments" },
    { icon: "fa-clipboard-check",  border: "border-secondary", color: "text-secondary", title: "Cycle Counts",           desc: "Physical stock-takes; shortages book unit losses. Plus cache reconcile in Maintenance.", ready: true, href: "/counts" },
    { icon: "fa-cart-arrow-down",  border: "border-danger",    color: "text-danger",    title: "Reordering",             desc: "Low-stock & out-of-stock products with reorder suggestions.", ready: true, href: "/reorder" },
    { icon: "fa-coins",            border: "border-warning",   color: "text-warning",   title: "Valuation",              desc: "Inventory value by warehouse and top products.", ready: true, href: "/valuation" },
];

export default function Home() {
    return (
        <ProtectedRoute>
            <Layout>
                <h2>Welcome to Rutba Inventory 📦</h2>
                <p className="text-muted mb-4">
                    Warehouses and bins, per-location stock levels, transfers, adjustments,
                    cycle counts, batch/expiry and reordering — the control centre for inventory.
                </p>

                <div className="row g-3">
                    {FEATURES.map((f) => (
                        <div className="col-md-4" key={f.title}>
                            <div className={`card ${f.border} h-100`}>
                                <div className="card-body">
                                    <h5 className="card-title">
                                        <i className={`fas ${f.icon} me-2 ${f.color}`}></i>{f.title}
                                    </h5>
                                    <p className="card-text text-muted">{f.desc}</p>
                                    {f.href ? (
                                        <Link className="btn btn-outline-primary btn-sm" href={f.href}>Open</Link>
                                    ) : (
                                        <span className={`badge ${f.ready ? "bg-success" : "bg-light text-muted border"}`}>
                                            {f.ready ? "Backend live" : "Coming soon"}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </Layout>
        </ProtectedRoute>
    );
}
