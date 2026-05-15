import Link from "next/link";
import StrapiImage from "../StrapiImage";

/**
 * Unified shell for every per-product page across pos-stock and rutba-cms.
 *
 * Provides a single back link, identity header (logo, name, SKU, barcode,
 * stock badge, status pill), action slot, alert region and a tab strip
 * that callers populate.
 *
 * Tab entries:
 *   { key, label, icon?, href?, onClick?, badge?, disabled?, hidden? }
 *
 * - If `href` is set the tab is rendered as a Next.js <Link>. If `onClick`
 *   is also set and returns a truthy value, default navigation is suppressed
 *   (caller handled it — e.g. dirty-state save-and-navigate).
 * - If only `onClick` is set the tab is rendered as a <button>.
 */
export default function ProductPageShell({
    product,
    isNew = false,
    backHref = "/products",
    backLabel = "Products",
    titleOverride,
    tabs = [],
    currentTab,
    statusPill,
    extraInfo,
    actions,
    alert,
    children,
}) {
    const name = titleOverride || product?.name || (isNew ? "New Product" : "Untitled Product");
    const sku = product?.sku;
    const barcode = product?.barcode;
    const logo = product?.logo;
    const stockQty = product?.stock_quantity;

    const visibleTabs = tabs.filter(t => !t.hidden);

    return (
        <div className="page-content">
            <div className="mb-2">
                <Link href={backHref} className="btn btn-sm btn-link p-0 text-decoration-none">
                    <i className="fas fa-arrow-left me-1" /> {backLabel}
                </Link>
            </div>

            <div className="d-flex align-items-center gap-3 mb-3 pb-3 border-bottom">
                <div className="flex-shrink-0">
                    {logo?.url ? (
                        <StrapiImage media={logo} format="thumbnail" maxWidth={56} maxHeight={56} />
                    ) : (
                        <div
                            className="d-flex align-items-center justify-content-center text-muted bg-light"
                            style={{ width: 56, height: 56, borderRadius: 6 }}
                        >
                            <i className="fas fa-image fa-lg" />
                        </div>
                    )}
                </div>
                <div className="flex-grow-1" style={{ minWidth: 0 }}>
                    <h4 className="mb-1 d-flex align-items-center gap-2 flex-wrap">
                        <span className="text-truncate">{name}</span>
                        {statusPill}
                    </h4>
                    <div className="text-muted small d-flex flex-wrap gap-3">
                        {sku && <span><i className="fas fa-hashtag me-1 opacity-50" />SKU {sku}</span>}
                        {barcode && <span><i className="fas fa-barcode me-1 opacity-50" />{barcode}</span>}
                        {stockQty != null && stockQty !== "" && (
                            <span><i className="fas fa-boxes me-1 opacity-50" />{stockQty} in stock</span>
                        )}
                        {extraInfo}
                    </div>
                </div>
                {actions && (
                    <div className="flex-shrink-0 d-flex gap-2 align-items-center flex-wrap justify-content-end">
                        {actions}
                    </div>
                )}
            </div>

            {alert?.error && (
                <div className="alert alert-danger alert-dismissible fade show" role="alert">
                    {alert.error}
                    {alert.onDismissError && (
                        <button type="button" className="btn-close" onClick={alert.onDismissError} />
                    )}
                </div>
            )}
            {alert?.success && (
                <div className="alert alert-success alert-dismissible fade show" role="alert">
                    {alert.success}
                    {alert.onDismissSuccess && (
                        <button type="button" className="btn-close" onClick={alert.onDismissSuccess} />
                    )}
                </div>
            )}

            {visibleTabs.length > 0 && (
                <ul className="nav nav-tabs mb-3">
                    {visibleTabs.map(tab => {
                        const active = tab.key === currentTab;
                        const className = `nav-link ${active ? "active" : ""}`;
                        const content = (
                            <>
                                {tab.icon && <i className={`fas ${tab.icon} me-1`} />}
                                {tab.label}
                                {tab.badge != null && tab.badge !== "" && (
                                    <span className="badge bg-secondary ms-1">{tab.badge}</span>
                                )}
                            </>
                        );

                        const handleClick = (e) => {
                            if (tab.onClick) {
                                const handled = tab.onClick(e, tab);
                                if (handled) e.preventDefault();
                            }
                        };

                        return (
                            <li className="nav-item" key={tab.key}>
                                {tab.href ? (
                                    <Link
                                        href={tab.href}
                                        className={className}
                                        onClick={handleClick}
                                        aria-current={active ? "page" : undefined}
                                    >
                                        {content}
                                    </Link>
                                ) : (
                                    <button
                                        type="button"
                                        className={className}
                                        onClick={handleClick}
                                        disabled={tab.disabled}
                                        aria-current={active ? "page" : undefined}
                                    >
                                        {content}
                                    </button>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            {children}
        </div>
    );
}

/**
 * Standard tab definitions for the pos-stock per-product pages.
 * Pass `documentId` and (optionally) `onNavigate` for dirty-state-aware
 * navigation. If `onNavigate(href)` returns a Promise that resolves to true,
 * the click is considered handled and default navigation is suppressed.
 */
export function buildStockProductTabs({ documentId, onNavigate, badges = {} } = {}) {
    if (!documentId) return [];
    const mk = (key, href) => {
        if (!onNavigate) return { href };
        return {
            href,
            onClick: () => {
                onNavigate(href);
                return true;
            },
        };
    };
    return [
        { key: "details", label: "Details", icon: "fa-info-circle", ...mk("details", `/${documentId}/product-edit`) },
        { key: "categorization", label: "Categorization", icon: "fa-tags", ...mk("categorization", `/${documentId}/product-edit?tab=categorization`) },
        { key: "media", label: "Media", icon: "fa-images", ...mk("media", `/${documentId}/product-edit?tab=media`) },
        { key: "pricing", label: "Pricing", icon: "fa-dollar-sign", ...mk("pricing", `/${documentId}/product-stock-items?tab=pricing`) },
        { key: "stock", label: "Stock", icon: "fa-boxes", ...mk("stock", `/${documentId}/product-stock-items`), badge: badges.stock },
        { key: "variants", label: "Variants", icon: "fa-layer-group", ...mk("variants", `/${documentId}/product-variants`), badge: badges.variants },
        { key: "relations", label: "Merge", icon: "fa-compress-arrows-alt", ...mk("relations", `/${documentId}/product-relations`) },
    ];
}
