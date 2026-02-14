import { useState, useEffect } from "react";
import Navigation from "./Navigation";
import NavigationSecondary from "./NavigationSecondary";
import FooterInfo from "@rutba/pos-shared/components/FooterInfo";

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

    const contentStyle = {
        minHeight: winHeight ? winHeight + 12 : 24,
    };

    return (
        <div>
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

            <main className="container" style={contentStyle}>
                {children}
            </main>

            <footer>
                <div className="container py-2">
                    <FooterInfo />
                </div>
            </footer>
        </div>
    );
}
