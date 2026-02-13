import { useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Layout from "../components/Layout";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { getAllowedApps, canAccessApp, APP_URLS } from "@rutba/pos-shared/lib/roles";

export default function Home() {
    const { user, role, appAccess, loading } = useAuth();
    const router = useRouter();

    if (loading) return <p className="text-center mt-5">Loading...</p>;

    const apps = getAllowedApps(appAccess);
    const hasAuthAccess = canAccessApp(appAccess, 'auth');

    return (
        <Layout>
            <ProtectedRoute>
                <div className="text-center mb-4">
                    <h1>Rutba POS</h1>
                    <p className="text-muted">Welcome, {user?.displayName || user?.username || user?.email}</p>
                    <p>
                        <span className="badge bg-secondary me-1">{role || 'No role'}</span>
                        {apps.map(a => <span key={a} className="badge bg-info me-1">{a}</span>)}
                    </p>
                </div>

                {/* App cards */}
                {apps.length === 0 ? (
                    <div className="alert alert-warning text-center">
                        Your account does not have access to any application.
                        Please contact your administrator.
                    </div>
                ) : (
                    <div className="row justify-content-center g-4 mb-5">
                        {apps.includes('stock') && (
                            <div className="col-md-5">
                                <a href={APP_URLS.stock} className="text-decoration-none">
                                    <div className="card h-100 shadow-sm border-primary">
                                        <div className="card-body text-center p-4">
                                            <i className="fas fa-boxes fa-3x text-primary mb-3"></i>
                                            <h4 className="card-title">Stock Management</h4>
                                            <p className="card-text text-muted small">Products, purchases, inventory</p>
                                        </div>
                                    </div>
                                </a>
                            </div>
                        )}
                        {apps.includes('sale') && (
                            <div className="col-md-5">
                                <a href={APP_URLS.sale} className="text-decoration-none">
                                    <div className="card h-100 shadow-sm border-success">
                                        <div className="card-body text-center p-4">
                                            <i className="fas fa-cash-register fa-3x text-success mb-3"></i>
                                            <h4 className="card-title">Point of Sale</h4>
                                            <p className="card-text text-muted small">Sales, cart, returns, reports</p>
                                        </div>
                                    </div>
                                </a>
                            </div>
                        )}
                    </div>
                )}

                {/* Admin quick links — only if user has auth access */}
                {hasAuthAccess && (
                    <div className="row justify-content-center g-3">
                        <div className="col-md-4">
                            <Link href="/users" className="text-decoration-none">
                                <div className="card shadow-sm">
                                    <div className="card-body text-center p-3">
                                        <i className="fas fa-users fa-2x text-dark mb-2"></i>
                                        <h5>Manage Users</h5>
                                    </div>
                                </div>
                            </Link>
                        </div>
                        <div className="col-md-4">
                            <Link href="/app-access" className="text-decoration-none">
                                <div className="card shadow-sm">
                                    <div className="card-body text-center p-3">
                                        <i className="fas fa-key fa-2x text-dark mb-2"></i>
                                        <h5>App Access</h5>
                                    </div>
                                </div>
                            </Link>
                        </div>
                    </div>
                )}
            </ProtectedRoute>
        </Layout>
    );
}

export async function getServerSideProps() { return { props: {} }; }
