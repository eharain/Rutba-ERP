import BaseLayout from "@rutba/pos-shared/components/BaseLayout";
import Navigation from "./Navigation";
import Sidebar from "./Sidebar";

export default function Layout({ children, fullWidth }) {
    return (
        <BaseLayout
            navigation={<Navigation />}
            sidebar={<Sidebar />}
            fullWidth={fullWidth}
            currentApp="accounts"
        >
            {children}
        </BaseLayout>
    );
}
