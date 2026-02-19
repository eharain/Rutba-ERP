import Navigation from "./Navigation";
import FooterInfo from "@rutba/pos-shared/components/FooterInfo";

export default function Layout({ children }) {
    return (
        <div className="d-flex flex-column min-vh-100">
            <Navigation />
            <main className="container flex-grow-1 py-4">
                {children}
            </main>
            <footer className="container py-2">
                <FooterInfo />
            </footer>
        </div>
    );
}
