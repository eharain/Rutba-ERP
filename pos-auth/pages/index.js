import { useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Layout from "../components/Layout";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { getAllowedApps, canAccessApp, APP_URLS, APP_META } from "@rutba/pos-shared/lib/roles";

export default function Home() {
    const { user, role, appAccess, loading } = useAuth();
    const router = useRouter();

    if (loading) return <p className="text-center mt-5">Loading...</p>;

    const apps = getAllowedApps(appAccess);
    const hasAuthAccess = canAccessApp(appAccess, 'auth');

    // App keys that should show as launchable cards (exclude 'auth' itself)
    const launchableApps = apps.filter(k => k !== 'auth' && APP_META[k]);

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
                {launchableApps.length === 0 ? (
                    <div className="alert alert-warning text-center">
                        Your account does not have access to any application.
                        Please contact your administrator.
                    </div>
                ) : (
                    <div className="row justify-content-center g-4 mb-5">
                        {launchableApps.map(appKey => {
                            const meta = APP_META[appKey];
                            return (
                                <div key={appKey} className="col-md-4 col-lg-3">
                                    <a href={APP_URLS[appKey]} className="text-decoration-none">
                                        <div className={`card h-100 shadow-sm ${meta.border}`}>
                                            <div className="card-body text-center p-4">
                                                <i className={`${meta.icon} fa-3x ${meta.color} mb-3`}></i>
                                                <h5 className="card-title">{meta.label}</h5>
                                                <p className="card-text text-muted small">{meta.description}</p>
                                            </div>
                                        </div>
                                    </a>
                                </div>
                            );
                        })}
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
