import { useState, useEffect } from "react";
import FooterInfo from "./FooterInfo";

/**
 * BaseLayout - Shared layout component for all Rutba applications
 * 
 * Provides consistent full-width header/footer with centered content containers.
 * Apps pass their Navigation components as props.
 * 
 * @param {React.ReactNode} children - Page content
 * @param {React.ReactNode} navigation - Primary navigation component
 * @param {React.ReactNode} navigationSecondary - Secondary navigation component (optional)
 * @param {boolean} fullWidth - If true, main content spans full width without max-width constraint
 */
export default function BaseLayout({ 
    children, 
    navigation, 
    navigationSecondary,
    fullWidth = false 
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

    const mainClassName = fullWidth ? "flex-grow-1" : "layout-main flex-grow-1";

    return (
        <div className="d-flex flex-column min-vh-100">
            <header className="layout-header border-bottom">
                <div className="layout-container d-flex flex-column py-2">
                    {navigation}
                    {navigationSecondary}
                </div>
            </header>

            <main className={mainClassName} style={{ minHeight: minHeight ? minHeight - 120 : 'auto' }}>
                {children}
            </main>

            <footer className="layout-footer border-top mt-auto">
                <div className="layout-container py-3">
                    <FooterInfo />
                </div>
            </footer>
        </div>
    );
}
