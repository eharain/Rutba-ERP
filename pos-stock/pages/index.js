import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import Link from "next/link";

export default function Home() {
    return (
        <ProtectedRoute>
            <Layout>
                <h2>Welcome to Rutba Stock Management 📦</h2>
                <p className="text-muted mb-4">
                    Manage products, inventory, purchases, and stock operations.
                </p>

                <div className="row g-3">
                    <div className="col-md-4">
                        <div className="card border-primary h-100">
                            <div className="card-body">
                                <h5 className="card-title"><i className="fas fa-boxes me-2 text-primary"></i>Products</h5>
                                <p className="card-text text-muted">Manage product records used across inventory and purchasing workflows.</p>
                                <Link className="btn btn-outline-primary btn-sm" href="/products">Manage Products</Link>
                            </div>
                        </div>
                    </div>
                    <div className="col-md-4">
                        <div className="card border-info h-100">
                            <div className="card-body">
                                <h5 className="card-title"><i className="fas fa-cubes me-2 text-info"></i>Stock Items</h5>
                                <p className="card-text text-muted">Review and manage available stock items and inventory status.</p>
                                <Link className="btn btn-outline-info btn-sm" href="/stock-items">View Stock Items</Link>
                            </div>
                        </div>
                    </div>
                    <div className="col-md-4">
                        <div className="card border-primary h-100">
                            <div className="card-body">
                                <h5 className="card-title"><i className="fas fa-store me-2 text-primary"></i>Branches</h5>
                                <p className="card-text text-muted">Manage branches, their sales desks, and the storage-location (bin) hierarchy.</p>
                                <Link className="btn btn-outline-primary btn-sm" href="/branches">Manage Branches</Link>
                            </div>
                        </div>
                    </div>
                    <div className="col-md-4">
                        <div className="card border-success h-100">
                            <div className="card-body">
                                <h5 className="card-title"><i className="fas fa-shopping-basket me-2 text-success"></i>Purchases</h5>
                                <p className="card-text text-muted">Create and track purchase entries to replenish stock inventory.</p>
                                <Link className="btn btn-outline-success btn-sm" href="/purchases">Manage Purchases</Link>
                            </div>
                        </div>
                    </div>
                    <div className="col-md-4">
                        <div className="card border-warning h-100">
                            <div className="card-body">
                                <h5 className="card-title"><i className="fas fa-unlink me-2 text-warning"></i>Orphan Stock Items</h5>
                                <p className="card-text text-muted">Identify stock items missing expected links for inventory cleanup.</p>
                                <Link className="btn btn-outline-warning btn-sm" href="/orphan-stock-items">Review Orphans</Link>
                            </div>
                        </div>
                    </div>
                    <div className="col-md-4">
                        <div className="card border-secondary h-100">
                            <div className="card-body">
                                <h5 className="card-title"><i className="fas fa-file-import me-2 text-secondary"></i>Bulk Stock Inputs</h5>
                                <p className="card-text text-muted">Import stock entries in bulk to speed up high-volume updates.</p>
                                <Link className="btn btn-outline-secondary btn-sm" href="/bulk-stock-inputs">Open Bulk Input</Link>
                            </div>
                        </div>
                    </div>
                    <div className="col-md-4">
                        <div className="card border-dark h-100">
                            <div className="card-body">
                                <h5 className="card-title"><i className="fas fa-archive me-2 text-dark"></i>Archive</h5>
                                <p className="card-text text-muted">Access archived stock records for review and historical tracking.</p>
                                <Link className="btn btn-outline-dark btn-sm" href="/archive-stock">View Archive</Link>
                            </div>
                        </div>
                    </div>
                </div>
            </Layout>
        </ProtectedRoute>
    );
}


