import BaseLayout from "@rutba/pos-shared/components/BaseLayout";
import Navigation from "./Navigation";
import NavigationSecondary from "./NavigationSecondary";

export default function Layout({ children, fullWidth }) {
    return (
        <BaseLayout 
            navigation={<Navigation />} 
            navigationSecondary={<NavigationSecondary />}
            fullWidth={fullWidth}
        >
            {children}
        </BaseLayout>
    );
}
