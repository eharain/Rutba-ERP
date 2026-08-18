import Topbar from "@rutba/shared/components/Topbar";

const SECONDARY = [
    { href: "/sale-orders",            label: "Orders",   variant: "primary" },
    { href: "/riders",                 label: "Riders",   variant: "info" },
    { href: "/delivery-methods",       label: "Methods",  variant: "secondary" },
    { href: "/delivery-zones",         label: "Zones",    variant: "success" },
    { href: "/notification-templates", label: "Templates",variant: "warning" },
];

// Logo now comes from Topbar's own site-settings lookup — see the note in
// apps/content/cms/components/Navigation.js.
export default function Navigation() {
    return <Topbar currentApp="order-management" appName="Order Management" secondary={SECONDARY} />;
}
