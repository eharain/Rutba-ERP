import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { canAccessApp } from "@rutba/pos-shared/lib/roles";

/**
 * Renders children only if the current user has access to the given app key.
 * Shows an access-denied message otherwise.
 */
export default function AppAccessGate({ appKey, children }) {
    const { appAccess, loading } = useAuth();

    if (loading) return <p>Loading...</p>;

    if (!canAccessApp(appAccess, appKey)) {
        return (
            <div className="alert alert-danger mt-4 text-center">
                <i className="fas fa-lock me-2"></i>
                <strong>Access Denied</strong> — you do not have <code>{appKey}</code> access.
                <br />
                <small className="text-muted">Contact your administrator to get access.</small>
            </div>
        );
    }

    return children;
}
