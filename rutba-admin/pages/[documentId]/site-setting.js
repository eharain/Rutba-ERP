import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Layout from "../../components/Layout";
import ProtectedRoute from "@rutba/pos-shared/components/ProtectedRoute";
import AppAccessGate from "../../components/AppAccessGate";
import PermissionCheck from "@rutba/pos-shared/components/PermissionCheck";
import { SiteSettingEndpoints } from "@rutba/api-provider/endpoints";
import FileView from "@rutba/pos-shared/components/FileView";
import { useToast } from "../../components/Toast";

/**
 * Per-row site settings editor for the admin console.
 *
 * Ported from rutba-cms's editor onto this app's chrome. Two deliberate
 * differences from the CMS original:
 *
 *  - It edits the analytics ids (GA4 / GTM / Meta Pixel), which the CMS editor
 *    does not — those used to live only on a CMS footer, and a footer isn't
 *    rendered on checkout or the auth pages.
 *  - It does NOT edit `custom_head_html` / `custom_body_end_html`. Those inject
 *    unescaped markup into every page of the storefront; widening the set of
 *    people who can do that is not something this task should do as a side
 *    effect. They are shown read-only, with a pointer to the CMS editor.
 */
export default function SiteSettingDetail() {
    const router = useRouter();
    const { documentId } = router.query;
    // `/new/site-setting` re-exports this page, where documentId is undefined —
    // so "new" has to cover both the literal and the missing param.
    const isNew = !documentId || documentId === "new";

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [record, setRecord] = useState(null);
    const [isPublished, setIsPublished] = useState(false);
    const { toast, ToastContainer } = useToast();

    // Identity — what makes this row resolvable
    const [appSlug, setAppSlug] = useState("");
    const [isDefault, setIsDefault] = useState(false);

    // Branding
    const [siteName, setSiteName] = useState("Rutba.pk");
    const [siteTagline, setSiteTagline] = useState("");
    const [siteDescription, setSiteDescription] = useState("");

    // SEO defaults
    const [siteUrl, setSiteUrl] = useState("");
    const [defaultMetaTitle, setDefaultMetaTitle] = useState("");
    const [defaultMetaDescription, setDefaultMetaDescription] = useState("");
    const [defaultMetaKeywords, setDefaultMetaKeywords] = useState("");
    const [twitterHandle, setTwitterHandle] = useState("");

    // Analytics / tracking
    const [gaMeasurementId, setGaMeasurementId] = useState("");
    const [gtmContainerId, setGtmContainerId] = useState("");
    const [metaPixelId, setMetaPixelId] = useState("");

    const hydrate = (d) => {
        if (!d) return;
        setRecord(d);
        setAppSlug(d.app_slug || "");
        setIsDefault(!!d.is_default);
        setSiteName(d.site_name || "Rutba.pk");
        setSiteTagline(d.site_tagline || "");
        setSiteDescription(d.site_description || "");
        setSiteUrl(d.site_url || "");
        setDefaultMetaTitle(d.default_meta_title || "");
        setDefaultMetaDescription(d.default_meta_description || "");
        setDefaultMetaKeywords(d.default_meta_keywords || "");
        setTwitterHandle(d.twitter_handle || "");
        setGaMeasurementId(d.ga_measurement_id || "");
        setGtmContainerId(d.gtm_container_id || "");
        setMetaPixelId(d.meta_pixel_id || "");
    };

    useEffect(() => {
        // Gate on router.isReady: on the first render of a dynamic route the
        // query is empty, and acting on that would look like "new".
        if (!router.isReady) return;
        if (isNew) { setLoading(false); return; }

        Promise.all([
            SiteSettingEndpoints.findOne(documentId, {}),
            SiteSettingEndpoints.findOne(documentId, { fields: ["documentId"], status: "published" })
                .catch(() => ({ data: null })),
        ])
            .then(([draftRes, pubRes]) => {
                hydrate(draftRes.data || draftRes);
                setIsPublished(!!(pubRes?.data && (pubRes.data.documentId || pubRes.data.id)));
            })
            .catch(err => {
                console.error("Failed to load site settings", err);
                toast("Failed to load this row.", "danger");
            })
            .finally(() => setLoading(false));
    }, [router.isReady, documentId, isNew]);

    // custom_head_html / custom_body_end_html are deliberately absent — see the
    // component doc comment. `default_footer` is absent for a different reason:
    // picking one means listing CMS footers, and the cms-footers descriptor does
    // not grant the `admin` domain. Rather than widen admin's reach into CMS
    // content for one dropdown, the footer is shown read-only below.
    //
    // Omitting all three from the payload leaves whatever the CMS editor set
    // untouched — a partial update, not a blanking.
    const buildPayload = () => ({
        data: {
            app_slug: appSlug || null,
            is_default: isDefault,
            site_name: siteName,
            site_tagline: siteTagline,
            site_description: siteDescription,
            site_url: siteUrl,
            default_meta_title: defaultMetaTitle,
            default_meta_description: defaultMetaDescription,
            default_meta_keywords: defaultMetaKeywords,
            twitter_handle: twitterHandle,
            ga_measurement_id: gaMeasurementId.trim(),
            gtm_container_id: gtmContainerId.trim(),
            meta_pixel_id: metaPixelId.trim(),
        },
    });

    // Create on first save, update thereafter. Returns the saved documentId so
    // publish can act on a row that only just came into existence.
    const persist = async () => {
        if (isNew || !record?.documentId) {
            const res = await SiteSettingEndpoints.create(buildPayload());
            const saved = res.data || res;
            hydrate(saved);
            // Move off /new so a refresh lands on the real row.
            router.replace(`/${saved.documentId}/site-setting`, undefined, { shallow: true });
            return saved.documentId;
        }
        const res = await SiteSettingEndpoints.updateDraft(record.documentId, buildPayload());
        const saved = res.data || res;
        hydrate(saved);
        return record.documentId;
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await persist();
            toast("Draft saved!", "success");
        } catch (err) {
            console.error("Failed to save site settings", err);
            toast(err?.response?.data?.error?.message || "Failed to save.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const handlePublish = async () => {
        setSaving(true);
        try {
            await persist();
            // Addressed by app slug, not documentId: the server publishes "the
            // row that resolves for this app". The helper's per-row
            // /site-settings/:id/publish route exists on neither server.
            // An empty slug is the default row, which is where an omitted slug
            // resolves anyway.
            await SiteSettingEndpoints.publish(appSlug);
            setIsPublished(true);
            toast("Site settings saved & published!", "success");
        } catch (err) {
            console.error("Failed to publish site settings", err);
            toast(err?.response?.data?.error?.message || "Failed to publish.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const handleUnpublish = async () => {
        if (!record?.documentId) return;
        if (!confirm("Unpublish these site settings? Apps resolving to this row will fall back to the default.")) return;
        setSaving(true);
        try {
            await SiteSettingEndpoints.unpublish(appSlug);
            setIsPublished(false);
            toast("Unpublished.", "success");
        } catch (err) {
            console.error("Failed to unpublish", err);
            toast("Failed to unpublish.", "danger");
        } finally {
            setSaving(false);
        }
    };

    const customHtml = [
        ["Custom head HTML", record?.custom_head_html],
        ["Custom body-end HTML", record?.custom_body_end_html],
    ].filter(([, v]) => (v || "").trim());

    return (
        <Layout>
            <ProtectedRoute>
                <AppAccessGate>
                <PermissionCheck adminOnly appKey="admin" required="admin">
                <ToastContainer />
                <div className="d-flex align-items-center mb-3">
                    <Link href="/site-settings" className="btn btn-sm btn-outline-secondary me-2">
                        <i className="fas fa-arrow-left"></i>
                    </Link>
                    <h2 className="mb-0">
                        <i className="fas fa-sliders me-2"></i>
                        {isNew ? "New Site Settings" : (siteName || "Site Settings")}
                    </h2>
                    {isDefault && <span className="badge bg-primary ms-2 align-self-center">Default</span>}
                    {isPublished && <span className="badge bg-success ms-2 align-self-center">Published</span>}
                    {record && !isPublished && <span className="badge bg-secondary ms-2 align-self-center">Draft</span>}
                    <div className="ms-auto d-flex gap-2">
                        {isPublished && (
                            <button className="btn btn-sm btn-outline-warning" onClick={handleUnpublish} disabled={saving}>
                                <i className="fas fa-eye-slash me-1"></i>Unpublish
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
                            {/* Identity — how apps find this row */}
                            <div className="card mb-3 border-primary">
                                <div className="card-header"><i className="fas fa-key me-2"></i>Which app is this for?</div>
                                <div className="card-body">
                                    <div className="row">
                                        <div className="col-md-6 mb-3">
                                            <label className="form-label">App Slug</label>
                                            <input
                                                type="text"
                                                className="form-control"
                                                value={appSlug}
                                                onChange={e => setAppSlug(e.target.value.trim().toLowerCase())}
                                                placeholder="e.g. web, pos, cms"
                                            />
                                            <small className="text-muted">
                                                An app asking for its settings matches on this. Leave empty and the row is
                                                only reachable as the default.
                                            </small>
                                        </div>
                                        <div className="col-md-6 mb-3">
                                            <label className="form-label d-block">Fallback</label>
                                            <div className="form-check mt-2">
                                                <input
                                                    className="form-check-input"
                                                    type="checkbox"
                                                    id="isDefault"
                                                    checked={isDefault}
                                                    onChange={e => setIsDefault(e.target.checked)}
                                                />
                                                <label className="form-check-label" htmlFor="isDefault">
                                                    Use as the default
                                                </label>
                                            </div>
                                            <small className="text-muted">
                                                Used when no app slug matches. Turning this on turns it off on every other
                                                row — there is only ever one default.
                                            </small>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Analytics & tracking */}
                            <div className="card mb-3">
                                <div className="card-header"><i className="fas fa-chart-line me-2"></i>Analytics &amp; Tracking</div>
                                <div className="card-body">
                                    <div className="alert alert-warning small">
                                        <i className="fas fa-triangle-exclamation me-1"></i>
                                        <strong>These only affect the storefront when set on the right row.</strong>{" "}
                                        The storefront identifies itself as <code>web</code>, so it reads the row whose
                                        app slug is <code>web</code> — or the default row when no <code>web</code> row
                                        exists. Ids set on the <code>admin</code> row have no effect on the storefront;
                                        this is the usual reason someone concludes tracking is broken.
                                        {appSlug && appSlug !== "web" && !isDefault && (
                                            <div className="mt-2 mb-0">
                                                This row is <code>{appSlug}</code> and is not the default, so nothing
                                                entered here will reach the storefront.
                                            </div>
                                        )}
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label">Google Analytics 4 Measurement ID</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            value={gaMeasurementId}
                                            onChange={e => setGaMeasurementId(e.target.value)}
                                            placeholder="G-XXXXXXXXXX"
                                        />
                                        <small className="text-muted">Leave empty and no Google Analytics script is loaded at all.</small>
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label">Google Tag Manager Container ID</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            value={gtmContainerId}
                                            onChange={e => setGtmContainerId(e.target.value)}
                                            placeholder="GTM-XXXXXXX"
                                        />
                                        <small className="text-muted">Optional, and independent of GA4 — set either, both, or neither.</small>
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label">Meta (Facebook) Pixel ID</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            value={metaPixelId}
                                            onChange={e => setMetaPixelId(e.target.value)}
                                            placeholder="123456789012345"
                                        />
                                        <small className="text-muted">Leave empty and no Meta Pixel script is loaded.</small>
                                    </div>
                                    <div className="small text-muted border-top pt-2">
                                        A CMS footer can carry its own ids. Where one does, the footer&apos;s value wins on
                                        pages using that footer and these act as the site-wide fallback — which is what
                                        covers checkout and the sign-in pages, since those render no footer.
                                    </div>
                                </div>
                            </div>

                            {/* Custom HTML — read-only on purpose */}
                            <div className="card mb-3">
                                <div className="card-header"><i className="fas fa-code me-2"></i>Custom HTML</div>
                                <div className="card-body">
                                    <p className="small text-muted">
                                        Raw markup injected unescaped into every storefront page. It is not editable here
                                        on purpose — editing it means being able to run arbitrary script site-wide, so it
                                        stays with the CMS editors who already had it. Manage it in <strong>rutba-cms →
                                        Site Settings</strong>.
                                    </p>
                                    {customHtml.length === 0 ? (
                                        <p className="mb-0 text-muted small"><em>Nothing set.</em></p>
                                    ) : (
                                        customHtml.map(([label, value]) => (
                                            <div key={label} className="mb-2">
                                                <label className="form-label small mb-1">{label}</label>
                                                <textarea
                                                    className="form-control form-control-sm font-monospace bg-light"
                                                    rows={3}
                                                    value={value}
                                                    readOnly
                                                    disabled
                                                />
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

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

                            {/* SEO defaults */}
                            <div className="card mb-3">
                                <div className="card-header"><i className="fas fa-search me-2"></i>SEO Defaults</div>
                                <div className="card-body">
                                    <div className="mb-3">
                                        <label className="form-label">Site URL</label>
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
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label">Twitter Handle <span className="text-muted small">(optional)</span></label>
                                        <input type="text" className="form-control" value={twitterHandle} onChange={e => setTwitterHandle(e.target.value)} placeholder="@rutbapk" />
                                    </div>
                                </div>
                            </div>

                            {/* Default footer */}
                            <div className="card mb-3">
                                <div className="card-header"><i className="fas fa-shoe-prints me-2"></i>Default Footer</div>
                                <div className="card-body">
                                    <div className="mb-2">
                                        <label className="form-label">Site-wide footer</label>
                                        <input
                                            type="text"
                                            className="form-control bg-light"
                                            value={record?.default_footer?.name || "— None —"}
                                            readOnly
                                            disabled
                                        />
                                    </div>
                                    <small className="text-muted d-block">
                                        Used when a CMS page doesn&apos;t specify its own footer. Read-only here — choosing
                                        one means browsing CMS footers, which this app has no grant for. Change it in{" "}
                                        <strong>rutba-cms → Site Settings</strong>. Saving from this page leaves it as it is.
                                    </small>
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
                </PermissionCheck>
                </AppAccessGate>
            </ProtectedRoute>
        </Layout>
    );
}

export async function getServerSideProps() {
    return { props: {} };
}
