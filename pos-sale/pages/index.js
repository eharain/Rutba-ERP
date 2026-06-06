import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import Link from "next/link";

export default function Home() {
    return (
        <ProtectedRoute>
            <Layout>
                <h2>Welcome to Rutba Point of Sale 🛒</h2>
                <p className="text-muted mb-4">
                    Create sales, process returns, manage cash registers, and view reports.
                </p>

                <div className="row g-3">
                    <div className="col-md-4">
                        <div className="card border-primary h-100">
                            <div className="card-body">
                                <h5 className="card-title"><i className="fas fa-shopping-cart me-2 text-primary"></i>Sales</h5>
                                <p className="card-text text-muted">Create new sales transactions and manage customer checkout workflows.</p>
                                <Link className="btn btn-outline-primary btn-sm" href="/sales">Open Sales</Link>
                            </div>
                        </div>
                    </div>
                    <div className="col-md-4">
                        <div className="card border-info h-100">
                            <div className="card-body">
                                <h5 className="card-title"><i className="fas fa-undo-alt me-2 text-info"></i>Returns</h5>
                                <p className="card-text text-muted">Process returned items and complete sale return adjustments.</p>
                                <Link className="btn btn-outline-info btn-sm" href="/sales-returns">Manage Returns</Link>
                            </div>
                        </div>
                    </div>
                    <div className="col-md-4">
                        <div className="card border-success h-100">
                            <div className="card-body">
                                <h5 className="card-title"><i className="fas fa-money-bill-wave me-2 text-success"></i>Cash Registers</h5>
                                <p className="card-text text-muted">Browse all register sessions, see the current one, and audit cash movement.</p>
                                <Link className="btn btn-outline-success btn-sm" href="/cash-register-history">All Registers</Link>
                            </div>
                        </div>
                    </div>
                    <div className="col-md-4">
                        <div className="card border-warning h-100">
                            <div className="card-body">
                                <h5 className="card-title"><i className="fas fa-cash-register me-2 text-warning"></i>Current Register</h5>
                                <p className="card-text text-muted">Open, monitor, and close the active register for daily POS operations.</p>
                                <Link className="btn btn-outline-warning btn-sm" href="/cash-register">Open / Current</Link>
                            </div>
                        </div>
                    </div>
                    <div className="col-md-4">
                        <div className="card border-dark h-100">
                            <div className="card-body">
                                <h5 className="card-title"><i className="fas fa-chart-line me-2 text-dark"></i>Reports</h5>
                                <p className="card-text text-muted">Track sales performance with operational and financial reporting.</p>
                                <Link className="btn btn-outline-dark btn-sm" href="/reports">View Reports</Link>
                            </div>
                        </div>
                    </div>
                </div>
            </Layout>
        </ProtectedRoute>
    );
}


