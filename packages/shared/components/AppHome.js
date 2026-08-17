import Link from "next/link";
import { APP_META, APP_CATEGORIES } from "../lib/roles";

/**
 * Shared building blocks for an app's landing page.
 *
 * Every app home used to hand-roll the same Bootstrap card grid, which is
 * why they drifted apart — different card borders, button colours, heading
 * levels and copy shapes. These components collapse that into one set:
 *
 *   <AppHome app="sale" subtitle="…" actions={…}>
 *     <AppHomeStats>…</AppHomeStats>
 *     <AppHomeGrid>
 *       <AppHomeTile href="/sales" icon="fa-cart-shopping" title="Sales" text="…" />
 *     </AppHomeGrid>
 *   </AppHome>
 *
 * The accent colour is not passed in by hand. It resolves from the app's
 * category in APP_META → APP_CATEGORIES, so an app that changes category
 * picks up the new identity colour everywhere at once, and two apps in the
 * same family (Stock and Inventory, say) deliberately look related.
 */

/** Category colours, keyed for lookup. */
const CATEGORY_COLOR = APP_CATEGORIES.reduce((acc, c) => {
    acc[c.key] = c.color;
    return acc;
}, {});

const FALLBACK_ACCENT = "#f5b400";

/**
 * Resolve an app key to its accent colour.
 * @param {string} appKey
 * @returns {string} hex colour
 */
export function appAccent(appKey) {
    const meta = APP_META[appKey];
    return (meta && CATEGORY_COLOR[meta.group]) || FALLBACK_ACCENT;
}

/** Normalise an icon string to a full FontAwesome class. */
function iconClass(icon, fallback = "fa-solid fa-circle") {
    if (!icon) return fallback;
    // Accept "fa-boxes", "fas fa-boxes" and "fa-solid fa-boxes" alike so
    // callers can paste icon names straight out of the old pages.
    return /^fa-(solid|regular|brands|light|thin)\b|^fas\b|^far\b|^fab\b/.test(icon)
        ? icon
        : `fa-solid ${icon}`;
}

/**
 * App landing-page shell: accent-washed hero band plus a stacked content
 * column. Renders the app's own icon and label from APP_META unless
 * overridden.
 *
 * @param {string} app       - app key (e.g. 'sale'), drives icon/label/accent
 * @param {string} title     - heading override (defaults to APP_META label)
 * @param {string} subtitle  - one-line description under the heading
 * @param {string} eyebrow   - small uppercase label above the heading
 * @param {string} icon      - icon override
 * @param {string} accent    - accent colour override (hex)
 * @param {React.ReactNode} actions - buttons rendered at the hero's right
 * @param {React.ReactNode} children
 */
export default function AppHome({
    app,
    title,
    subtitle,
    eyebrow,
    icon,
    accent,
    actions,
    children,
}) {
    const meta = APP_META[app] || {};
    const resolvedAccent = accent || appAccent(app);
    const resolvedTitle = title || meta.label || "Rutba";
    const resolvedSubtitle = subtitle || meta.description || "";
    const resolvedIcon = iconClass(icon || meta.icon, "fa-solid fa-cube");

    return (
        <div className="app-home" style={{ "--app-accent": resolvedAccent }}>
            <section className="app-hero">
                <div className="app-hero-inner">
                    <span className="app-hero-icon" aria-hidden="true">
                        <i className={resolvedIcon}></i>
                    </span>

                    <div className="app-hero-text">
                        {eyebrow && <div className="app-hero-eyebrow">{eyebrow}</div>}
                        <h1 className="app-hero-title">{resolvedTitle}</h1>
                        {resolvedSubtitle && <p className="app-hero-sub">{resolvedSubtitle}</p>}
                    </div>

                    {actions && <div className="app-hero-actions">{actions}</div>}
                </div>
            </section>

            {children}
        </div>
    );
}

/**
 * Small uppercase section label, optionally with a link on the right.
 *
 * @param {string} title
 * @param {string} href  - optional "view all" target
 * @param {string} linkLabel
 */
export function AppHomeSection({ title, href, linkLabel = "View all" }) {
    return (
        <div className="app-section-head">
            <h2 className="app-section-title">{title}</h2>
            {href && (
                <Link href={href} className="app-section-link">
                    {linkLabel} <i className="fa-solid fa-arrow-right ms-1" style={{ fontSize: "0.7em" }}></i>
                </Link>
            )}
        </div>
    );
}

/** Auto-fitting strip of stat cards. */
export function AppHomeStats({ children }) {
    return <div className="app-stats">{children}</div>;
}

/**
 * A single headline number.
 *
 * Pass `loading` to show a shimmer instead of the value — dashboards fetch
 * their counts client-side, and a shimmer keeps the strip from reflowing
 * once the numbers land.
 *
 * @param {string|number} value
 * @param {string} label
 * @param {string} icon
 * @param {string} tone   - a tone name (primary/success/…) or a hex colour
 * @param {string} href   - makes the whole stat a link
 * @param {boolean} loading
 * @param {string} hint   - optional small print under the label
 */
export function AppHomeStat({ value, label, icon, tone, href, loading = false, hint }) {
    const style = tone ? { "--rb-tone": toneValue(tone) } : undefined;

    const body = (
        <>
            {icon && (
                <span className="app-stat-icon" aria-hidden="true">
                    <i className={iconClass(icon)}></i>
                </span>
            )}
            <div className="app-stat-body">
                <div className={`app-stat-value${loading ? " is-loading" : ""}`}>
                    {loading ? "" : value}
                </div>
                <div className="app-stat-label">{label}</div>
                {hint && <div className="app-stat-hint">{hint}</div>}
            </div>
        </>
    );

    if (href) {
        return (
            <Link href={href} className="app-stat" style={style}>
                {body}
            </Link>
        );
    }
    return <div className="app-stat" style={style}>{body}</div>;
}

/**
 * Grid of launcher tiles.
 * @param {boolean} compact - tighter columns, for apps with many sections
 */
export function AppHomeGrid({ children, compact = false }) {
    return <div className={`app-tiles${compact ? " is-compact" : ""}`}>{children}</div>;
}

/**
 * One launcher tile. Renders as a link, or as an inert card when
 * `disabled` is set (used for screens that haven't shipped yet).
 *
 * @param {string} href
 * @param {string} icon
 * @param {string} title
 * @param {string} text
 * @param {string} tone     - tone name or hex; defaults to the app accent
 * @param {boolean} external - render a plain <a> instead of a next/link
 * @param {boolean} newTab   - external tiles open in a new tab unless this is
 *   false. The app launcher sets it false: switching apps should replace the
 *   current tab, not pile up one tab per app.
 * @param {boolean} disabled
 * @param {React.ReactNode} badge - pill(s) rendered in the tile foot
 */
export function AppHomeTile({
    href,
    icon,
    title,
    text,
    tone,
    external = false,
    newTab = true,
    disabled = false,
    badge,
}) {
    const style = tone ? { "--rb-tone": toneValue(tone) } : undefined;

    const body = (
        <>
            <div className="app-tile-head">
                <span className="app-tile-icon" aria-hidden="true">
                    <i className={iconClass(icon)}></i>
                </span>
                <h3 className="app-tile-title">{title}</h3>
                {!disabled && (
                    <i
                        className={`app-tile-go fa-solid ${external && newTab ? "fa-arrow-up-right-from-square" : "fa-arrow-right"}`}
                        aria-hidden="true"
                    ></i>
                )}
            </div>
            {text && <p className="app-tile-text">{text}</p>}
            {badge && <div className="app-tile-foot">{badge}</div>}
        </>
    );

    if (disabled || !href) {
        return <div className="app-tile is-disabled" style={style}>{body}</div>;
    }

    if (external) {
        const target = newTab ? { target: "_blank", rel: "noopener noreferrer" } : {};
        return (
            <a href={href} className="app-tile" style={style} {...target}>
                {body}
            </a>
        );
    }

    return (
        <Link href={href} className="app-tile" style={style}>
            {body}
        </Link>
    );
}

/** Status pill for a tile foot. `kind` is 'live' | 'soon' | 'accent'. */
export function AppHomePill({ children, kind = "accent", icon }) {
    return (
        <span className={`app-pill is-${kind}`}>
            {icon && <i className={iconClass(icon)}></i>}
            {children}
        </span>
    );
}

/**
 * Bordered content block for dashboard columns.
 *
 * @param {string} title
 * @param {string} icon
 * @param {string} href      - optional link in the header
 * @param {string} linkLabel
 * @param {string} tone
 * @param {boolean} flush    - drop the body padding (for <ul className="app-list">)
 */
export function AppHomePanel({
    title,
    icon,
    href,
    linkLabel = "View all",
    tone,
    flush = false,
    children,
}) {
    const style = tone ? { "--rb-tone": toneValue(tone) } : undefined;
    return (
        <div className="app-panel" style={style}>
            <div className="app-panel-head">
                <h3 className="app-panel-title">
                    {icon && <i className={iconClass(icon)}></i>}
                    {title}
                </h3>
                {href && <Link href={href} className="app-panel-link">{linkLabel}</Link>}
            </div>
            {flush ? children : <div className="app-panel-body">{children}</div>}
        </div>
    );
}

/** Centred empty-state line for use inside a panel. */
export function AppHomeEmpty({ children }) {
    return <div className="app-panel-empty">{children}</div>;
}

/**
 * Map a tone name to the CSS variable that holds it, passing hex colours
 * through untouched.
 */
function toneValue(tone) {
    if (!tone) return undefined;
    if (tone.startsWith("#") || tone.startsWith("rgb") || tone.startsWith("hsl")) return tone;
    return `var(--tone-${tone}, var(--app-accent))`;
}
