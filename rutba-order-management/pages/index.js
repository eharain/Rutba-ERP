import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import Link from "next/link";

export default function Home() {
    return (
        <ProtectedRoute>
            <Layout>
                <h2>Welcome to Order Management 📦</h2>
                <p className="text-muted mb-4">
                    Manage web orders, rider operations, delivery methods/zones, and notification templates.
                </p>

                <div className="row g-3">
                    <div className="col-md-4">
                        <div className="card border-dark h-100">
                            <div className="card-body">
                                <h5 className="card-title"><i className="fas fa-shopping-bag me-2 text-dark"></i>Orders</h5>
                                <p className="card-text text-muted">View and track web orders from customers.</p>
                                <Link className="btn btn-outline-dark btn-sm" href="/sale-orders">View Orders</Link>
                            </div>
                        </div>
                    </div>
                    <div className="col-md-4">
                        <div className="card border-primary h-100">
                            <div className="card-body">
                                <h5 className="card-title"><i className="fas fa-motorcycle me-2 text-primary"></i>Riders</h5>
                                <p className="card-text text-muted">Manage rider fleet status and zone assignments.</p>
                                <Link className="btn btn-outline-primary btn-sm" href="/riders">Manage Riders</Link>
                            </div>
                        </div>
                    </div>
                    <div className="col-md-4">
                        <div className="card border-info h-100">
                            <div className="card-body">
                                <h5 className="card-title"><i className="fas fa-truck me-2 text-info"></i>Delivery Methods</h5>
                                <p className="card-text text-muted">Review delivery costing and product group mappings.</p>
                                <Link className="btn btn-outline-info btn-sm" href="/delivery-methods">Manage Methods</Link>
                            </div>
                        </div>
                    </div>
                    <div className="col-md-4">
                        <div className="card border-warning h-100">
                            <div className="card-body">
                                <h5 className="card-title"><i className="fas fa-map-marked-alt me-2 text-warning"></i>Delivery Zones</h5>
                                <p className="card-text text-muted">Manage domestic and international delivery coverage zones.</p>
                                <Link className="btn btn-outline-warning btn-sm" href="/delivery-zones">Manage Zones</Link>
                            </div>
                        </div>
                    </div>
                    <div className="col-md-4">
                        <div className="card border-secondary h-100">
                            <div className="card-body">
                                <h5 className="card-title"><i className="fas fa-bell me-2 text-secondary"></i>Notifications</h5>
                                <p className="card-text text-muted">Manage order lifecycle notification templates and channels.</p>
                                <Link className="btn btn-outline-secondary btn-sm" href="/notification-templates">Manage Templates</Link>
                            </div>
                        </div>
                    </div>
                </div>
            </Layout>
        </ProtectedRoute>
    );
}

