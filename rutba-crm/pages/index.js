import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import Link from "next/link";

export default function Home() {
    return (
        <ProtectedRoute>
            <Layout>
                <h2>Welcome to Rutba CRM 🤝</h2>
                <p className="text-muted mb-4">
                    Manage customer relationships, track leads, and monitor interactions.
                </p>

                <div className="row g-3">
                    <div className="col-md-4">
                        <div className="card border-primary h-100">
                            <div className="card-body">
                                <h5 className="card-title"><i className="fas fa-address-book me-2 text-primary"></i>Contacts</h5>
                                <p className="card-text text-muted">Maintain customer and business contact records with profile details.</p>
                                <Link className="btn btn-outline-primary btn-sm" href="/contacts">Manage Contacts</Link>
                            </div>
                        </div>
                    </div>
                    <div className="col-md-4">
                        <div className="card border-info h-100">
                            <div className="card-body">
                                <h5 className="card-title"><i className="fas fa-user-plus me-2 text-info"></i>Leads</h5>
                                <p className="card-text text-muted">Track and qualify leads through your sales pipeline stages.</p>
                                <Link className="btn btn-outline-info btn-sm" href="/leads">Manage Leads</Link>
                            </div>
                        </div>
                    </div>
                    <div className="col-md-4">
                        <div className="card border-secondary h-100">
                            <div className="card-body">
                                <h5 className="card-title"><i className="fas fa-tasks me-2 text-secondary"></i>Activities</h5>
                                <p className="card-text text-muted">Log calls, meetings, and follow-ups to monitor team interactions.</p>
                                <Link className="btn btn-outline-secondary btn-sm" href="/activities">View Activities</Link>
                            </div>
                        </div>
                    </div>
                </div>
            </Layout>
        </ProtectedRoute>
    );
}

