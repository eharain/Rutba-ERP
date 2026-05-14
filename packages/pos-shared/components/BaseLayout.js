import { useState, useEffect } from "react";
import FooterInfo from "./FooterInfo";

/**
 * BaseLayout - Shared layout component for all Rutba applications
 *
 * Provides consistent full-width header/footer with centered content
 * containers. Optionally renders a left sidebar — when `sidebar` is
 * passed, the navigation collapses to a slim top bar and the main
 * content sits to the right of the rail.
 *
 * @param {React.ReactNode} children - Page content
 * @param {React.ReactNode} navigation - Primary navigation (top bar)
 * @param {React.ReactNode} navigationSecondary - Secondary navigation (optional)
 * @param {React.ReactNode} sidebar - Left-side rail navigation (optional)
 * @param {boolean} fullWidth - If true, main content spans full width
 * @param {string} currentApp - App key (e.g. 'sale') passed to footer AppSwitcher
 */
export default function BaseLayout({
    children,
    navigation,
    navigationSecondary,
    sidebar,
    fullWidth = false,
    currentApp = ''
}) {
    const [minHeight, setMinHeight] = useState(0);

    useEffect(() => {
        function updateHeight() {
            setMinHeight(window.innerHeight || 500);
        }
        updateHeight();
        window.addEventListener('resize', updateHeight);
        return () => window.removeEventListener('resize', updateHeight);
    }, []);

    const hasSidebar = Boolean(sidebar);
    const mainClassName = [
        hasSidebar ? "layout-main-with-sidebar" : (fullWidth ? "flex-grow-1" : "layout-main flex-grow-1"),
    ].join(" ");

    return (
        <div className={`d-flex flex-column min-vh-100${hasSidebar ? " has-sidebar" : ""}`}>
            <header className="layout-header border-bottom">
                <div className={hasSidebar ? "layout-header-bar" : "layout-container d-flex flex-column py-2"}>
                    {navigation}
                    {navigationSecondary}
                </div>
            </header>

            {hasSidebar ? (
                <div className="layout-body">
                    <div className="layout-sidebar">{sidebar}</div>
                    <main className={mainClassName} style={{ minHeight: minHeight ? minHeight - 120 : 'auto' }}>
                        {children}
                    </main>
                </div>
            ) : (
                <main className={mainClassName} style={{ minHeight: minHeight ? minHeight - 120 : 'auto' }}>
                    {children}
                </main>
            )}

            <footer className="layout-footer border-top mt-auto">
                <div className={hasSidebar ? "layout-footer-bar" : "layout-container"}>
                    <FooterInfo currentApp={currentApp} />
                </div>
            </footer>
        </div>
    );
}
