import { useEffect } from "react";
import { useRouter } from "next/router";
import { AuthProvider } from "@rutba/pos-shared/context/AuthContext";
import { CartProvider } from "@rutba/pos-shared/context/CartContext";
import { UtilProvider, useUtil } from "@rutba/pos-shared/context/UtilContext";
import BranchDeskModal from "@rutba/pos-shared/components/BranchDeskModal";
import { setAppName } from "@rutba/pos-shared/lib/api";

setAppName('sale');

import 'bootstrap/dist/css/bootstrap.min.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import '@rutba/pos-shared/styles/layout.css';
import '../src/app/globals.css';
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

function BranchDeskGuard({ children }) {
    const { branch, desk, setBranch, setBranchDesk, setCurrency, showBranchDeskModal, setShowBranchDeskModal, hydrated } = useUtil();
    const router = useRouter();

    // Skip the guard entirely on print/popup pages
    const isPrintPage = router.pathname.startsWith('/print');

    // Auto-show when branch or desk is missing — only after storage has been loaded
    useEffect(() => {
        if (!isPrintPage && hydrated && (!branch || !desk)) {
            setShowBranchDeskModal(true);
        }
    }, [isPrintPage, hydrated, branch, desk, setShowBranchDeskModal]);

    if (isPrintPage) return children;

    const handleSelect = (newBranch, newDesk) => {
        setBranch(newBranch);
        setBranchDesk(newDesk);
        const currencySymbol = newDesk.currency?.symbol ?? newBranch.currency?.symbol ?? 'Rs';
        setCurrency(currencySymbol);
        setShowBranchDeskModal(false);
    };

    return (
        <>
            {children}
            <BranchDeskModal
                isOpen={showBranchDeskModal}
                onSelect={handleSelect}
                currentBranch={branch}
                currentDesk={desk}
            />
        </>
    );
}

export default function App({ Component, pageProps }) {
    useEffect(() => {
        import("bootstrap/dist/js/bootstrap.bundle.min.js");
    }, []);

    return (
        <div className={`${geistSans.variable} ${geistMono.variable} h-100`}>
            <AuthProvider>
                <CartProvider>
                    <UtilProvider>
                        <BranchDeskGuard>
                            <Component {...pageProps} />
                        </BranchDeskGuard>
                    </UtilProvider>
                </CartProvider>
            </AuthProvider>
        </div>
    );
}
