import Topbar from "@rutba/pos-shared/components/Topbar";

export default function Navigation() {
    return (
        <Topbar
            currentApp="crm"
            brand={<>
                <i className="fa-solid fa-headset text-warning"></i>
                <span>Rutba CRM</span>
            </>}
        />
    );
}
