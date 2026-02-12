import { useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { getAllowedApps, getHomeUrl, APP_URLS } from "@rutba/pos-shared/lib/roles";

export default function Home() {
    const { user, role, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (loading) return;
        if (!user) {
            router.replace("/login");
            return;
        }
        // If user has exactly one allowed app, redirect directly
        const apps = getAllowedApps(role);
        if (apps.length === 1) {
            window.location.href = APP_URLS[apps[0]];
            return;
        }
        // Otherwise stay on dashboard (multiple apps or no access)
    }, [user, role, loading]);

    if (loading) return <p className="text-center mt-5">Loading...</p>;
    if (!user) return null;

    const apps = getAllowedApps(role);

    return (
        <div className="container py-5">
            <div className="text-center mb-5">
                <h1>Rutba POS</h1>
                <p className="text-muted">Welcome, {user.displayName || user.username || user.email}</p>
                <p><span className="badge bg-secondary">{role || 'No role assigned'}</span></p>
            </div>

            {apps.length === 0 ? (
                <div className="alert alert-warning text-center">
                    Your account does not have access to any application.
                    Please contact your administrator.
                </div>
            ) : (
                <div className="row justify-content-center g-4">
                    {apps.includes('stock') && (
                        <div className="col-md-5">
                            <a href={APP_URLS.stock} className="text-decoration-none">
                                <div className="card h-100 shadow-sm border-primary">
                                    <div className="card-body text-center p-5">
                                        <i className="fas fa-boxes fa-3x text-primary mb-3"></i>
                                        <h3 className="card-title">Stock Management</h3>
                                        <p className="card-text text-muted">Products, purchases, inventory, suppliers, brands &amp; categories</p>
                                    </div>
                                </div>
                            </a>
                        </div>
                    )}
                    {apps.includes('sale') && (
                        <div className="col-md-5">
                            <a href={APP_URLS.sale} className="text-decoration-none">
                                <div className="card h-100 shadow-sm border-success">
                                    <div className="card-body text-center p-5">
                                        <i className="fas fa-cash-register fa-3x text-success mb-3"></i>
                                        <h3 className="card-title">Point of Sale</h3>
                                        <p className="card-text text-muted">Sales, cart, returns, cash register &amp; reports</p>
                                    </div>
                                </div>
                            </a>
                        </div>
                    )}
                </div>
            )}

            <div className="text-center mt-4">
                <button className="btn btn-outline-danger" onClick={() => {
                    // useAuth logout is accessed via context; simplify with direct import
                    import('@rutba/pos-shared/lib/authStorage').then(m => m.authStorage.clearAll());
                    import('@rutba/pos-shared/lib/storage').then(m => {
                        m.storage.removeItem('user');
                        m.storage.removeItem('jwt');
                        m.storage.removeItem('role');
                        m.storage.removeItem('permissions');
                    });
                    window.location.href = '/login';
                }}>
                    <i className="fas fa-sign-out-alt me-1"></i> Logout
                </button>
            </div>
        </div>
    );
}

export async function getServerSideProps() { return { props: {} }; }
