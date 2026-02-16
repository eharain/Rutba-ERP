import BaseLayout from "@rutba/pos-shared/components/BaseLayout";
import Navigation from "./Navigation";

export default function Layout({ children, fullWidth }) {
    return (
        <BaseLayout 
            navigation={<Navigation />}
            fullWidth={fullWidth}
        >
            {children}
        </BaseLayout>
    );
}
