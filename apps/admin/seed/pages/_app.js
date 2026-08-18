import { useEffect } from "react";
import { PrimeReactProvider } from "primereact/api";
import { AuthProvider } from "@rutba/shared/context/AuthContext";
import { UtilProvider } from "@rutba/shared/context/UtilContext";
import { AppContextEndpoints } from "@rutba/api-provider/endpoints";

AppContextEndpoints.setAppName('seed');

import 'bootstrap/dist/css/bootstrap.min.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import '@rutba/shared/styles/layout.css';
import '../src/styles/globals.css';
import 'primereact/resources/themes/saga-blue/theme.css';
import 'primereact/resources/primereact.min.css';
import { Geist, Geist_Mono } from "next/font/google";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export default function App({ Component, pageProps }) {
    useEffect(() => {
        import("bootstrap/dist/js/bootstrap.bundle.min.js").catch(() => {});
    }, []);

    return (
        <div className={`${geistSans.variable} ${geistMono.variable} h-100`}>
            <PrimeReactProvider>
            <AuthProvider>
                <UtilProvider>
                    <Component {...pageProps} />
                </UtilProvider>
            </AuthProvider>
            </PrimeReactProvider>
        </div>
    );
}
