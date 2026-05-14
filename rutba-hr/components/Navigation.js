import Topbar from "@rutba/pos-shared/components/Topbar";

const SECONDARY = [
    { href: "/employees",              label: "Employees",     variant: "primary"   },
    { href: "/departments",            label: "Departments",   variant: "info"      },
    { href: "/teams",                  label: "Teams",         variant: "success"   },
    { href: "/hr-team-management",     label: "Team Mgmt",     variant: "dark"      },
    { href: "/hr-employee-management", label: "Employee Mgmt", variant: "secondary" },
    { href: "/leave-requests",         label: "Leave Requests",variant: "warning"   },
];

export default function Navigation() {
    return (
        <Topbar
            currentApp="hr"
            secondary={SECONDARY}
            brand={<>
                <i className="fa-solid fa-users text-warning"></i>
                <span>Rutba HR</span>
            </>}
        />
    );
}
