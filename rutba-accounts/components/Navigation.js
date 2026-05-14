import Topbar from "@rutba/pos-shared/components/Topbar";

export default function Navigation() {
    return (
        <Topbar
            currentApp="accounts"
            brand={<>
                <i className="fa-solid fa-calculator text-warning"></i>
                <span>Rutba Accounts</span>
            </>}
        />
    );
}
