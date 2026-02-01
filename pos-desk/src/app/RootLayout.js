// src/app/layout.js
import { Geist, Geist_Mono } from "next/font/google";
import 'bootstrap/dist/css/bootstrap.min.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './globals.css';
import './colors.css';
import './layout.css';
import './links.css';

import styles from "./page.module.css";


const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata = {
    title: "Rutba POS",
    description: "POS system",
};
import { AuthProvider } from "../../context/AuthContext";
import { CartProvider } from "../../context/CartContext";
import { UtilProvider } from "../../context/UtilContext";
export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <body className={`${geistSans.variable} ${geistMono.variable}  h-100`}> 
                <AuthProvider>
                    <CartProvider>
                        <UtilProvider>
                            {children}
                        </UtilProvider>
                    </CartProvider>
                </AuthProvider>
            </body>
        </html>
    );
}
