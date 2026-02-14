import { useEffect } from "react";
import { AuthProvider } from "@rutba/pos-shared/context/AuthContext";
import { UtilProvider } from "@rutba/pos-shared/context/UtilContext";
import { setAppName } from "@rutba/pos-shared/lib/api";

setAppName('auth');

import 'bootstrap/dist/css/bootstrap.min.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import '../src/app/globals.css';
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
        import("bootstrap/dist/js/bootstrap.bundle.min.js");
    }, []);

    return (
        <div className={`${geistSans.variable} ${geistMono.variable} h-100`}>
            <AuthProvider>
                <UtilProvider>
                    <Component {...pageProps} />
                </UtilProvider>
            </AuthProvider>
        </div>
    );
}
