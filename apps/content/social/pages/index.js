import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/shared/components/ProtectedRoute";
import AppHome, { AppHomeGrid, AppHomeTile, AppHomeSection } from "@rutba/shared/components/AppHome";
import Link from "next/link";

const SECTIONS = [
    { href: "/posts", icon: "fa-paper-plane", tone: "primary", title: "Posts", text: "Create, schedule and publish to Instagram, Facebook, X, LinkedIn, TikTok, YouTube and WhatsApp." },
    { href: "/replies", icon: "fa-comments", tone: "info", title: "Replies", text: "View and manage comments and replies across all connected platforms." },
    { href: "/accounts", icon: "fa-key", tone: "secondary", title: "Accounts", text: "Connect and configure API credentials for each social platform." },
    { href: "/media", icon: "fa-photo-film", tone: "purple", title: "Media", text: "Upload and manage the images and videos your posts draw on." },
];

export default function Home() {
    return (
        <ProtectedRoute>
            <Layout>
                <AppHome
                    app="social"
                    eyebrow="Channels"
                    title="Social Media"
                    subtitle="Author once, publish to every connected platform, and keep the replies in one inbox."
                    actions={
                        <Link href="/posts" className="btn btn-accent">
                            <i className="fa-solid fa-plus me-2"></i>New post
                        </Link>
                    }
                >
                    <AppHomeSection title="Everything in Social Media" />
                    <AppHomeGrid>
                        {SECTIONS.map((s) => (
                            <AppHomeTile key={s.href} {...s} />
                        ))}
                    </AppHomeGrid>
                </AppHome>
            </Layout>
        </ProtectedRoute>
    );
}
