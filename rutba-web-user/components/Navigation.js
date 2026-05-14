import Topbar from "@rutba/pos-shared/components/Topbar";

export default function Navigation() {
    return (
        <Topbar
            currentApp="web-user"
            brand={<>
                <i className="fa-solid fa-user text-warning"></i>
                <span>Rutba Web Orders</span>
            </>}
        />
    );
}
