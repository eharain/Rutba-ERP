import NavAppSwitcher from "./NavAppSwitcher";

/**
 * AppSwitcher
 *
 * Renders a small dropup menu (opens upward from the footer) with
 * icon links to every app the current user has access to.
 *
 * @param {string} currentApp - key of the app we're inside (e.g. 'sale')
 */
export default function AppSwitcher({ currentApp }) {
    return <NavAppSwitcher currentApp={currentApp} />;
}
