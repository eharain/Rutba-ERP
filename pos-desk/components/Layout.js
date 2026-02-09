import { useState, useRef, useEffect } from "react";
import Navigation from "./Navigation";
import NavigationSecondary from "./NavigationSecondary";
import SearchMenu from "./SearchMenu";
import FooterInfo from "./FooterInfo";

export default function Layout({ children }) {
    const [winHeight, setWinHeight] = useState(0);


    useEffect(() => {
        function updateHeights() {

            const hh = window.innerHeight || 500;
            setWinHeight(hh);
        }

        updateHeights();
        window.addEventListener('resize', updateHeights);
        return () => window.removeEventListener('resize', updateHeights);
    }, []);

    // apply spacing so main content isn't hidden behind fixed header/footer
    const contentStyle = {
        minHeight: winHeight ? winHeight + 12 : 24,

    };

    return (
        <div>
            {/* Fixed header - stays on top */}
            <header className="top-0 start-0 end-0">
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
            <main className="container" style={contentStyle}>
                {children}
            </main>

            {/* Fixed footer close to browser bottom */}
            <footer>
                <div className="container py-2">
                    <FooterInfo />
                </div>
            </footer>
        </div>
    );
}
