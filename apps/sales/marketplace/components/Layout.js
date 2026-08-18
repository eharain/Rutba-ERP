import BaseLayout from "@rutba/shared/components/BaseLayout";
import Navigation from "./Navigation";
import Sidebar from "./Sidebar";
import EngineHealthBanner from "./EngineHealthBanner";

export default function Layout({ children, fullWidth }) {
    return (
        <BaseLayout
            navigation={<Navigation />}
            sidebar={<Sidebar />}
            fullWidth={fullWidth}
            currentApp="marketplace"
        >
            {/* Above the page content on every screen: a dead service token
                stops ALL syncing, so it must not be something you only see if
                you happen to open the right page. */}
            <EngineHealthBanner />
            {children}
        </BaseLayout>
    );
}
