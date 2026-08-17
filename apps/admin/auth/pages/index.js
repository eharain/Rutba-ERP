import Layout from "../components/Layout";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import AppHome, {
    AppHomeGrid,
    AppHomeTile,
    AppHomeSection,
} from "@rutba/pos-shared/components/AppHome";
import { getAllowedApps, APP_URLS, APP_META, APP_CATEGORIES } from "@rutba/pos-shared/lib/roles";

/**
 * The SSO portal home — the launcher every user lands on.
 *
 * Apps are grouped by their APP_META category rather than listed flat, so a
 * catalogue that now runs to twenty-odd apps stays scannable. Each group takes
 * the category's own colour, which is the same colour that app's own hero uses
 * once you're inside it.
 */
export default function Home() {
    const { user, role, appAccess, adminAppAccess, loading } = useAuth();

    if (loading) {
        return (
            <Layout>
                <div className="app-panel-empty">
                    <i className="fa-solid fa-circle-notch fa-spin me-2"></i>Loading your apps…
                </div>
            </Layout>
        );
    }

    const effectiveAccess = [...new Set([...(appAccess || []), ...(adminAppAccess || [])])];
    const apps = getAllowedApps(effectiveAccess);

    // Launchable = everything except the portal itself.
    const launchable = apps.filter((k) => k !== "auth" && APP_META[k]);

    const groups = APP_CATEGORIES
        .map((cat) => ({
            ...cat,
            apps: launchable.filter((k) => APP_META[k].group === cat.key),
        }))
        .filter((g) => g.apps.length > 0);

    const displayName = user?.displayName || user?.username || user?.email || "there";

    return (
        <Layout>
            <ProtectedRoute>
                <AppHome
                    app="auth"
                    eyebrow="Rutba ERP"
                    title={`Welcome back, ${displayName}`}
                    subtitle={
                        launchable.length > 0
                            ? `You have access to ${launchable.length} app${launchable.length === 1 ? "" : "s"}. Pick one to get going.`
                            : "Your account is set up, but no applications have been granted to it yet."
                    }
                    actions={
                        <span className="app-pill is-accent">
                            <i className="fa-solid fa-user-shield"></i>
                            {role || "No role"}
                        </span>
                    }
                >
                    {launchable.length === 0 ? (
                        <div className="app-panel">
                            <div className="app-panel-empty">
                                <i className="fa-solid fa-triangle-exclamation fa-2x d-block mb-3 text-warning"></i>
                                Your account does not have access to any application.
                                <br />
                                Please contact your administrator.
                            </div>
                        </div>
                    ) : (
                        groups.map((group) => (
                            <div key={group.key} className="d-flex flex-column gap-3">
                                <AppHomeSection title={group.label} />
                                <AppHomeGrid>
                                    {group.apps.map((appKey) => {
                                        const meta = APP_META[appKey];
                                        return (
                                            <AppHomeTile
                                                key={appKey}
                                                href={APP_URLS[appKey]}
                                                icon={meta.icon}
                                                tone={group.color}
                                                title={meta.label}
                                                text={meta.description}
                                                external
                                                newTab={false}
                                            />
                                        );
                                    })}
                                </AppHomeGrid>
                            </div>
                        ))
                    )}
                </AppHome>
            </ProtectedRoute>
        </Layout>
    );
}
