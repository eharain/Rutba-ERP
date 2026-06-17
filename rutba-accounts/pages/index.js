import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import Link from "next/link";

export default function Home() {
    return (
        <ProtectedRoute>
            <Layout>
                <h2>Welcome to Rutba Accounts 📊</h2>
                <p className="text-muted mb-4">
                    Manage your chart of accounts, journal entries, invoices, and expense operations.
                </p>

                <div className="row g-3">
                    <div className="col-md-4">
                        <div className="card border-primary h-100">
                            <div className="card-body">
                                <h5 className="card-title"><i className="fas fa-sitemap me-2 text-primary"></i>Chart of Accounts</h5>
                                <p className="card-text text-muted">Organize and maintain account structure for financial reporting.</p>
                                <Link className="btn btn-outline-primary btn-sm" href="/chart-of-accounts">Manage Accounts</Link>
                            </div>
                        </div>
                    </div>
                    <div className="col-md-4">
                        <div className="card border-info h-100">
                            <div className="card-body">
                                <h5 className="card-title"><i className="fas fa-book me-2 text-info"></i>Journal Entries</h5>
                                <p className="card-text text-muted">Record and review journal entries for day-to-day accounting activity.</p>
                                <Link className="btn btn-outline-info btn-sm" href="/journal-entries">View Entries</Link>
                            </div>
                        </div>
                    </div>
                    <div className="col-md-4">
                        <div className="card border-success h-100">
                            <div className="card-body">
                                <h5 className="card-title"><i className="fas fa-file-invoice-dollar me-2 text-success"></i>Invoices</h5>
                                <p className="card-text text-muted">Manage invoices, billing records, and payment tracking workflows.</p>
                                <Link className="btn btn-outline-success btn-sm" href="/invoices">Manage Invoices</Link>
                            </div>
                        </div>
                    </div>
                    <div className="col-md-4">
                        <div className="card border-warning h-100">
                            <div className="card-body">
                                <h5 className="card-title"><i className="fas fa-receipt me-2 text-warning"></i>Expenses</h5>
                                <p className="card-text text-muted">Track expenses and maintain supporting financial records.</p>
                                <Link className="btn btn-outline-warning btn-sm" href="/expenses">Track Expenses</Link>
                            </div>
                        </div>
                    </div>
                    <div className="col-md-4">
                        <div className="card border-dark h-100">
                            <div className="card-body">
                                <h5 className="card-title"><i className="fas fa-chart-line me-2 text-dark"></i>Reports</h5>
                                <p className="card-text text-muted">Trial balance, P&amp;L, balance sheet, cash flow and AR/AP aging.</p>
                                <Link className="btn btn-outline-dark btn-sm" href="/reports">View Reports</Link>
                            </div>
                        </div>
                    </div>
                </div>
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() { return { props: {} }; }
