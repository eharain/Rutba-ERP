import { useState } from "react";
import Navigation from "./Navigation";
import NavigationSecondary from "./NavigationSecondary";
import SearchMenu from "./SearchMenu";
import FooterInfo from "./FooterInfo";
import RootLayout from "../src/app/RootLayout";
export default function Layout({ children }) {
    const [showAside, setShowAside] = useState(false);

    return (
        <div className="container mt-4">
            <div className="row">
                {/* Navigation always full width */}
                <div className="col-12">
                    <Navigation />
                    <NavigationSecondary />
                </div>
            </div>
            <div className="row">

                {/* Main content */}
                <main className={` ${showAside ? "col-md-9" : "col-md-12" }`} >
                    {children}
                </main>

                {/* Aside (toggleable) */}
                {/*{showAside && (*/}
                {/*    <aside className="col-md-3">*/}
                {/*        <SearchMenu />*/}
                {/*    </aside>*/}
                {/*)}*/}
            </div>

            {/* Footer outside row */}
            <FooterInfo />

            {/* Floating toggle button */}
            {/*<button*/}
            {/*    className="btn btn-light border shadow-sm"*/}
            {/*    onClick={() => setShowAside(!showAside)}*/}
            {/*    style={{*/}
            {/*        position: "fixed",*/}
            {/*        right: "0.5rem",*/}
            {/*        top: "10rem",*/}
            {/*        borderRadius: "20%",*/}
            {/*        width: "40px",*/}
            {/*        height: "40px",*/}
            {/*        display: "flex",*/}
            {/*        alignItems: "center",*/}
            {/*        justifyContent: "center",*/}
            {/*        zIndex: 1050,*/}
            {/*    }}*/}
            {/*    title={showAside ? "Hide panel" : "Show panel"}*/}
            {/*>*/}
            {/*    <i className={`fas fa-${showAside ? "times" : "search"}`} />*/}
            {/*</button>*/}
        </div>
    );
}
