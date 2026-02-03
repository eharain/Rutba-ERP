import { useState, useRef, useEffect } from "react";
import Navigation from "./Navigation";
import NavigationSecondary from "./NavigationSecondary";
import SearchMenu from "./SearchMenu";
import FooterInfo from "./FooterInfo";

export default function Layout({ children }) {
    const [showAside, setShowAside] = useState(false);
    const headerRef = useRef(null);
    const footerRef = useRef(null);
    const [headerHeight, setHeaderHeight] = useState(0);
    const [footerHeight, setFooterHeight] = useState(0);

    useEffect(() => {
        function updateHeights() {
            const hh = headerRef.current?.offsetHeight || 0;
            const fh = footerRef.current?.offsetHeight || 0;
            setHeaderHeight(hh);
            setFooterHeight(fh);
        }

        updateHeights();
        window.addEventListener('resize', updateHeights);
        return () => window.removeEventListener('resize', updateHeights);
    }, []);

    // apply spacing so main content isn't hidden behind fixed header/footer
    const contentStyle = {
        paddingTop: headerHeight ? headerHeight + 12 : 24,
        paddingBottom: footerHeight ? footerHeight + 12 : 24,
    };

    return (
        <div>
            {/* Fixed header - stays on top */}
            <header ref={headerRef} className="position-fixed top-0 start-0 end-0" style={{ zIndex: 1030 }}>
                <div className="container d-flex flex-column py-2">
                    <div>
                        <Navigation />
                    </div>
                    <div>
                        <NavigationSecondary />
                    </div>
                </div>
            </header>

            {/* Main container with spacing to account for fixed header/footer */}
            <div className="container" style={contentStyle}>
                <div className="row">
                    {/* Main content */}
                    <main className={` ${showAside ? "col-md-9" : "col-md-12" }`} >
                        {children}
                    </main>

                    {/* Aside (toggleable) */}
                    {/*{showAside && (
                        <aside className="col-md-3">
                            <SearchMenu />
                        </aside>
                    )}*/}
                </div>
            </div>

            {/* Fixed footer close to browser bottom */}
            <footer ref={footerRef} className="position-fixed bottom-0 start-0 end-0" style={{ zIndex: 1020 }}>
                <div className="container py-2">
                    <FooterInfo />
                </div>
            </footer>
        </div>
    );
}
