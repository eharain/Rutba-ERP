import Topbar from "@rutba/pos-shared/components/Topbar";

export default function Navigation() {
    return (
        <Topbar
            currentApp="payroll"
            brand={<>
                <i className="fa-solid fa-money-bill-trend-up text-warning"></i>
                <span>Rutba Payroll</span>
            </>}
        />
    );
}
