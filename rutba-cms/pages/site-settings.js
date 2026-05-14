import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import { useAuth } from "@rutba/pos-shared/context/AuthContext";
import { SiteSettingEndpoints, CmsFootersEndpoints } from "@rutba/api-provider/endpoints";
import { useToast } from "../components/Toast";
import FileView from "@rutba/pos-shared/components/FileView";
import Link from "next/link";

export default function SiteSettingsPage() {
    const { jwt } = useAuth();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [record, setRecord] = useState(null);
    const [isPublished, setIsPublished] = useState(false);
    const { toast, ToastContainer } = useToast();

    // Fields
    const [siteName, setSiteName] = useState("Rutba.pk");
    const [siteTagline, setSiteTagline] = useState("Premium Products at Exceptional Prices");
    const [siteDescription, setSiteDescription] = useState("Your ultimate destination for premium products at exceptional prices");
    const [headerPromoEnabled, setHeaderPromoEnabled] = useState(false);
    const [headerPromoText, setHeaderPromoText] = useState("");
    const [headerPromoCtaText, setHeaderPromoCtaText] = useState("");
    const [headerPromoCtaUrl, setHeaderPromoCtaUrl] = useState("");
    const [navExploreProductsLabel, setNavExploreProductsLabel] = useState("Explore Products");
    const [navExploreBrandsLabel, setNavExploreBrandsLabel] = useState("Explore Brands");
    const [navLoginLabel, setNavLoginLabel] = useState("Login or Register");
    const [navSearchPlaceholder, setNavSearchPlaceholder] = useState("Search Products");

    // SEO defaults — override per-page from CMS pages
    const [siteUrl, setSiteUrl] = useState("");
    const [defaultMetaTitle, setDefaultMetaTitle] = useState("");
    const [defaultMetaDescription, setDefaultMetaDescription] = useState("");
    const [defaultMetaKeywords, setDefaultMetaKeywords] = useState("");
    const [twitterHandle, setTwitterHandle] = useState("");
    const [defaultFooterId, setDefaultFooterId] = useState("");
    const [allFooters, setAllFooters] = useState([]);

    useEffect(() => {
        if (!jwt) return;
        Promise.all([
            SiteSettingEndpoints.fetchDraft({ populate: ["site_logo", "favicon", "default_og_image", "default_footer"] }).catch(() => ({ data: null })),
            SiteSettingEndpoints.getPublished({ fields: ["id"] }).catch(() => ({ data: null })),
        ])
            .then(([draftRes, pubRes]) => {
                const d = draftRes.data || draftRes;
                if (d && d.id) {
                    setRecord(d);
                    setIsPublished(!!(pubRes.data && pubRes.data.id));
                    setSiteName(d.site_name || "Rutba.pk");
                    setSiteTagline(d.site_tagline || "");
                    setSiteDescription(d.site_description || "");
                    setHeaderPromoEnabled(!!d.header_promo_enabled);
                    setHeaderPromoText(d.header_promo_text || "");
                    setHeaderPromoCtaText(d.header_promo_cta_text || "");
                    setHeaderPromoCtaUrl(d.header_promo_cta_url || "");
                    setNavExploreProductsLabel(d.nav_explore_products_label || "Explore Products");
                    setNavExploreBrandsLabel(d.nav_explore_brands_label || "Explore Brands");
                    setNavLoginLabel(d.nav_login_label || "Login or Register");
                    setNavSearchPlaceholder(d.nav_search_placeholder || "Search Products");
                    setSiteUrl(d.site_url || "");
                    setDefaultMetaTitle(d.default_meta_title || "");
                    setDefaultMetaDescription(d.default_meta_description || "");
                    setDefaultMetaKeywords(d.default_meta_keywords || "");
                    setTwitterHandle(d.twitter_handle || "");
                    setDefaultFooterId(d.default_footer?.documentId || "");
                }
            })
            .catch(err => console.error("Failed to load site settings", err))
            .finally(() => setLoading(false));
    }, [jwt]);

    useEffect(() => {
        if (!jwt) return;
        CmsFootersEndpoints.listDraft({ sort: ["name:asc"], pageSize: 100 })
            .then(res => setAllFooters(res?.data || res || []))
            .catch(err => console.error("Failed to load footers", err));
    }, [jwt]);

    const buildPayload = () => ({
        data: {
            site_name: siteName,
            site_tagline: siteTagline,
            site_description: siteDescription,
            header_promo_enabled: headerPromoEnabled,
            header_promo_text: headerPromoText,
            header_promo_cta_text: headerPromoCtaText,
            header_promo_cta_url: headerPromoCtaUrl,
            nav_explore_products_label: navExploreProductsLabel,
            nav_explore_brands_label: navExploreBrandsLabel,
            nav_login_label: navLoginLabel,
            nav_search_placeholder: navSearchPlaceholder,
            site_url: siteUrl,
            default_meta_title: defaultMetaTitle,
            default_meta_description: defaultMetaDescription,
            default_meta_keywords: defaultMetaKeywords,
            twitter_handle: twitterHandle,
            default_footer: defaultFooterId || null,
        },
    });

    const handleSave = async () => {
        setSaving(true);
        try {
            let res;
            res = await SiteSettingEndpoints.updateDraft(buildPayload());
            const saved = res.data || res;
            setRecord(saved);
            toast("Draft saved!", "success");
        } catch (err) {
            console.error("Failed to save site settings", err);
            toast("Failed to save.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const handlePublish = async () => {
        setSaving(true);
        try {
            await SiteSettingEndpoints.updateDraft(buildPayload());
            await SiteSettingEndpoints.publish();
            setIsPublished(true);
            toast("Site settings saved & published!", "success");
        } catch (err) {
            console.error("Failed to publish site settings", err);
            toast("Failed to publish.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const handleDiscardDraft = async () => {
        if (!confirm("Discard draft changes and load the published version?")) return;
        setSaving(true);
        try {
            await SiteSettingEndpoints.discard();
            const res = await SiteSettingEndpoints.fetchDraft({ populate: ["site_logo", "favicon", "default_og_image", "default_footer"] });
            const d = res.data || res;
            setRecord(d);
            setSiteName(d.site_name || "");
            setSiteTagline(d.site_tagline || "");
            setSiteDescription(d.site_description || "");
            setHeaderPromoEnabled(!!d.header_promo_enabled);
            setHeaderPromoText(d.header_promo_text || "");
            setHeaderPromoCtaText(d.header_promo_cta_text || "");
            setHeaderPromoCtaUrl(d.header_promo_cta_url || "");
            setNavExploreProductsLabel(d.nav_explore_products_label || "Explore Products");
            setNavExploreBrandsLabel(d.nav_explore_brands_label || "Explore Brands");
            setNavLoginLabel(d.nav_login_label || "Login or Register");
            setNavSearchPlaceholder(d.nav_search_placeholder || "Search Products");
            setSiteUrl(d.site_url || "");
            setDefaultMetaTitle(d.default_meta_title || "");
            setDefaultMetaDescription(d.default_meta_description || "");
            setDefaultMetaKeywords(d.default_meta_keywords || "");
            setTwitterHandle(d.twitter_handle || "");
            setDefaultFooterId(d.default_footer?.documentId || "");
            toast("Loaded published version.", "success");
        } catch (err) {
            console.error("Failed to discard draft", err);
            toast("Failed to discard draft.", "danger");
        } finally {
            setSaving(false);
        }
    };

    return (
        <ProtectedRoute>
            <Layout>
                <ToastContainer />
                <div className="d-flex align-items-center mb-3">
                    <h2 className="mb-0"><i className="fas fa-cog me-2"></i>Site Settings</h2>
                    {isPublished && <span className="badge bg-success ms-2 align-self-center">Published</span>}
                    {record && !isPublished && <span className="badge bg-secondary ms-2 align-self-center">Draft</span>}
                    <div className="ms-auto d-flex gap-2">
                        {isPublished && (
                            <button className="btn btn-sm btn-outline-warning" onClick={handleDiscardDraft} disabled={saving}>
                                <i className="fas fa-undo me-1"></i>Load Published
                            </button>
                        )}
                        <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving}>
                            {saving ? "Saving…" : "Save Draft"}
                        </button>
                        <button className="btn btn-sm btn-success" onClick={handlePublish} disabled={saving}>
                            <i className="fas fa-upload me-1"></i>{saving ? "Publishing…" : "Save & Publish"}
                        </button>
                    </div>
                </div>

                {loading && <p>Loading...</p>}

                {!loading && (
                    <div className="row">
                        <div className="col-md-8">
                            {/* Branding */}
                            <div className="card mb-3">
                                <div className="card-header"><i className="fas fa-palette me-2"></i>Branding</div>
                                <div className="card-body">
                                    <div className="row">
                                        <div className="col-md-6 mb-3">
                                            <label className="form-label">Site Name</label>
                                            <input type="text" className="form-control" value={siteName} onChange={e => setSiteName(e.target.value)} placeholder="e.g. Rutba.pk" />
                                            <small className="text-muted">Shown in header, page titles, copyright</small>
                                        </div>
                                        <div className="col-md-6 mb-3">
                                            <label className="form-label">Tagline</label>
                                            <input type="text" className="form-control" value={siteTagline} onChange={e => setSiteTagline(e.target.value)} placeholder="Premium Products at Exceptional Prices" />
                                            <small className="text-muted">Appended to default page title</small>
                                        </div>
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label">Site Description (SEO)</label>
                                        <textarea className="form-control" rows={3} value={siteDescription} onChange={e => setSiteDescription(e.target.value)} placeholder="Default meta description for the site" />
                                    </div>
                                </div>
                            </div>

                            {/* Promo Banner */}
                            <div className="card mb-3">
                                <div className="card-header"><i className="fas fa-bullhorn me-2"></i>Header Promo Banner</div>
                                <div className="card-body">
                                    <div className="form-check mb-3">
                                        <input className="form-check-input" type="checkbox" id="promoEnabled" checked={headerPromoEnabled} onChange={e => setHeaderPromoEnabled(e.target.checked)} />
                                        <label className="form-check-label" htmlFor="promoEnabled">Enable promo banner</label>
                                    </div>
                                    {headerPromoEnabled && (
                                        <div className="row">
                                            <div className="col-md-6 mb-3">
                                                <label className="form-label">Promo Text</label>
                                                <input type="text" className="form-control" value={headerPromoText} onChange={e => setHeaderPromoText(e.target.value)} placeholder="FREE SHIPPING ALL OVER PAKISTAN" />
                                            </div>
                                            <div className="col-md-3 mb-3">
                                                <label className="form-label">CTA Button Text</label>
                                                <input type="text" className="form-control" value={headerPromoCtaText} onChange={e => setHeaderPromoCtaText(e.target.value)} placeholder="SHOP NOW" />
                                            </div>
                                            <div className="col-md-3 mb-3">
                                                <label className="form-label">CTA Button URL</label>
                                                <input type="text" className="form-control" value={headerPromoCtaUrl} onChange={e => setHeaderPromoCtaUrl(e.target.value)} placeholder="/shop" />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* SEO Defaults */}
                            <div className="card mb-3">
                                <div className="card-header"><i className="fas fa-search me-2"></i>SEO Defaults</div>
                                <div className="card-body">
                                    <div className="mb-3">
                                        <label className="form-label">Site URL <span className="text-danger">*</span></label>
                                        <input type="url" className="form-control" value={siteUrl} onChange={e => setSiteUrl(e.target.value)} placeholder="https://rutba.pk" />
                                        <small className="text-muted">Used to build canonical URLs, OG tags, and the sitemap. No trailing slash.</small>
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label">Default Meta Title</label>
                                        <input type="text" className="form-control" value={defaultMetaTitle} onChange={e => setDefaultMetaTitle(e.target.value)} placeholder="Falls back to “Site Name — Tagline”" maxLength={70} />
                                        <small className="text-muted">{defaultMetaTitle.length}/70 — used when a page has no Meta Title.</small>
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label">Default Meta Description</label>
                                        <textarea className="form-control" rows={3} value={defaultMetaDescription} onChange={e => setDefaultMetaDescription(e.target.value)} placeholder="Falls back to Site Description" maxLength={200} />
                                        <small className="text-muted">{defaultMetaDescription.length}/200 — used when a page has no Meta Description.</small>
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label">Default Keywords <span className="text-muted small">(comma-separated)</span></label>
                                        <input type="text" className="form-control" value={defaultMetaKeywords} onChange={e => setDefaultMetaKeywords(e.target.value)} placeholder="e.g. online shopping, premium products, pakistan" />
                                        <small className="text-muted">Merged with each page's keywords (deduped).</small>
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label">Twitter Handle <span className="text-muted small">(optional)</span></label>
                                        <input type="text" className="form-control" value={twitterHandle} onChange={e => setTwitterHandle(e.target.value)} placeholder="@rutbapk" />
                                    </div>
                                </div>
                            </div>

                            {/* Default Footer */}
                            <div className="card mb-3">
                                <div className="card-header d-flex align-items-center justify-content-between">
                                    <span><i className="fas fa-shoe-prints me-2"></i><strong>Default Footer</strong></span>
                                    <Link href="/footers" className="btn btn-sm btn-outline-secondary">
                                        Manage Footers
                                    </Link>
                                </div>
                                <div className="card-body">
                                    <div className="mb-2">
                                        <label className="form-label">Site-wide footer</label>
                                        <select
                                            className="form-select"
                                            value={defaultFooterId}
                                            onChange={e => setDefaultFooterId(e.target.value)}
                                        >
                                            <option value="">— None —</option>
                                            {allFooters.map(f => (
                                                <option key={f.documentId} value={f.documentId}>
                                                    {f.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <small className="text-muted d-block">
                                        Used when a CMS page doesn't specify its own footer. Tracking codes (GA / Pixel / GTM)
                                        on this footer become site-wide. Pick the footer that should run on every page by default.
                                    </small>
                                    {defaultFooterId && (
                                        <Link
                                            href={`/${defaultFooterId}/cms-footer`}
                                            className="btn btn-sm btn-outline-primary mt-2"
                                        >
                                            <i className="fas fa-edit me-1"></i>
                                            Edit selected footer
                                        </Link>
                                    )}
                                </div>
                            </div>

                            {/* Navigation Labels */}
                            <div className="card mb-3">
                                <div className="card-header"><i className="fas fa-compass me-2"></i>Navigation Labels</div>
                                <div className="card-body">
                                    <div className="row">
                                        <div className="col-md-6 mb-3">
                                            <label className="form-label">Explore Products Label</label>
                                            <input type="text" className="form-control" value={navExploreProductsLabel} onChange={e => setNavExploreProductsLabel(e.target.value)} />
                                        </div>
                                        <div className="col-md-6 mb-3">
                                            <label className="form-label">Explore Brands Label</label>
                                            <input type="text" className="form-control" value={navExploreBrandsLabel} onChange={e => setNavExploreBrandsLabel(e.target.value)} />
                                        </div>
                                        <div className="col-md-6 mb-3">
                                            <label className="form-label">Login Button Label</label>
                                            <input type="text" className="form-control" value={navLoginLabel} onChange={e => setNavLoginLabel(e.target.value)} />
                                        </div>
                                        <div className="col-md-6 mb-3">
                                            <label className="form-label">Search Placeholder</label>
                                            <input type="text" className="form-control" value={navSearchPlaceholder} onChange={e => setNavSearchPlaceholder(e.target.value)} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="col-md-4">
                            <div className="card mb-3">
                                <div className="card-header">Site Logo</div>
                                <div className="card-body">
                                    {record ? (
                                        <FileView
                                            single={record.site_logo}
                                            refName="site-setting"
                                            refId={record.id}
                                            refIsSingleType
                                            refDraft
                                            field="site_logo"
                                            name="site-logo"
                                        />
                                    ) : (
                                        <p className="text-muted mb-0">Save a draft first to upload a logo.</p>
                                    )}
                                    <small className="text-muted d-block mt-2">Displayed in the header. Falls back to site name text if not set.</small>
                                </div>
                            </div>
                            <div className="card mb-3">
                                <div className="card-header">Default Social Image (OG)</div>
                                <div className="card-body">
                                    {record ? (
                                        <FileView
                                            single={record.default_og_image}
                                            refName="site-setting"
                                            refId={record.id}
                                            refIsSingleType
                                            refDraft
                                            field="default_og_image"
                                            name="default-og-image"
                                        />
                                    ) : (
                                        <p className="text-muted mb-0">Save a draft first to upload.</p>
                                    )}
                                    <small className="text-muted d-block mt-2">Shown when a page is shared on social. Recommended 1200×630.</small>
                                </div>
                            </div>
                            <div className="card mb-3">
                                <div className="card-header">Favicon</div>
                                <div className="card-body">
                                    {record ? (
                                        <FileView
                                            single={record.favicon}
                                            refName="site-setting"
                                            refId={record.id}
                                            refIsSingleType
                                            refDraft
                                            field="favicon"
                                            name="favicon"
                                        />
                                    ) : (
                                        <p className="text-muted mb-0">Save a draft first to upload a favicon.</p>
                                    )}
                                    <small className="text-muted d-block mt-2">Browser tab icon. Upload a .png or .ico file.</small>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </Layout>
        </ProtectedRoute>
    );
}

export async function getServerSideProps() {
    return { props: {} };
}
