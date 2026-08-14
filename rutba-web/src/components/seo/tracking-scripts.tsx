import Script from "next/script";
import { CmsFooterInterface } from "@/types/api/cms-page";
import { useSiteSettings } from "@/hooks/use-site-settings";

interface TrackingScriptsProps {
  /**
   * The footer in effect for this route, when there is one. Optional: most
   * routes (checkout, login, register, …) have no footer at all, which is
   * exactly why the site-settings fallback below exists.
   */
  footer?: CmsFooterInterface;
}

/** "" and whitespace mean unset, not "a value that happens to be empty". */
function firstSet(...values: (string | undefined | null)[]) {
  for (const v of values) {
    const t = v?.trim();
    if (t) return t;
  }
  return undefined;
}

/**
 * Injects analytics / pixel / GTM scripts. Every id is optional — a block that
 * isn't configured is not rendered at all, so an unconfigured site ships no
 * third-party script tags whatsoever.
 *
 * RESOLUTION: a footer value wins when set, otherwise the site-settings value.
 *
 * The footer is checked FIRST even though site settings are now the primary
 * place to configure this. That order is deliberate and is about not breaking
 * live sites: these five fields existed on cms-footer before site-setting had
 * them, so a site that already carries a GA id on its footer keeps using that
 * exact id after this change, with nothing to migrate. Site settings fill in
 * underneath — which is what finally covers the footerless routes. Flip the
 * order and any footer configured today would be silently overridden by a
 * blank-or-different site-setting value.
 *
 * MOUNTED ONCE, FROM `_app`. It used to mount from <Footer>, which meant the
 * six routes that render no footer — checkout, contact, login, register,
 * forgot-password, reset-password — fired no analytics at all; an untracked
 * checkout being the expensive half of that. `_app` resolves the per-page
 * footer from `pageProps.initialPage.footer` (see _app.tsx), so the footer
 * override survives the move. Keep it to a single mount: next/script dedupes
 * two <Script> tags sharing an `id`, but nothing dedupes two
 * `gtag('config', …)` calls, and that shows up as doubled page_views.
 *
 * `custom_head_html` / `custom_body_end_html` accept editor-pasted raw markup
 * for partners with no tidy id slot (Hotjar, Clarity, LinkedIn Insight). Both
 * inject unescaped, so they are privileged CMS-authenticated content — edited
 * in rutba-cms only, deliberately not exposed as editable fields in the admin
 * app. The "head" block is appended to <head> client-side after mount: SSR-safe,
 * at the cost of a small flash before it runs, which is fine for analytics.
 */
export default function TrackingScripts({ footer }: TrackingScriptsProps) {
  const settings = useSiteSettings();

  const ga = firstSet(footer?.ga_measurement_id, settings.ga_measurement_id);
  const pixel = firstSet(footer?.meta_pixel_id, settings.meta_pixel_id);
  const gtm = firstSet(footer?.gtm_container_id, settings.gtm_container_id);
  const headHtml = firstSet(footer?.custom_head_html, settings.custom_head_html);
  const bodyEndHtml = firstSet(
    footer?.custom_body_end_html,
    settings.custom_body_end_html
  );

  return (
    <>
      {/* Google Tag Manager */}
      {gtm && (
        <>
          <Script id="gtm-init" strategy="afterInteractive">
            {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
              new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
              j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
              'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
              })(window,document,'script','dataLayer','${gtm}');`}
          </Script>
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${gtm}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
            />
          </noscript>
        </>
      )}

      {/* Google Analytics 4 */}
      {ga && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${ga}`}
            strategy="afterInteractive"
            id="ga-loader"
          />
          <Script id="ga-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${ga}', { anonymize_ip: true });`}
          </Script>
        </>
      )}

      {/* Meta (Facebook) Pixel */}
      {pixel && (
        <>
          <Script id="fb-pixel" strategy="afterInteractive">
            {`!function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${pixel}');
              fbq('track', 'PageView');`}
          </Script>
          <noscript>
            <img
              height="1"
              width="1"
              style={{ display: "none" }}
              alt=""
              src={`https://www.facebook.com/tr?id=${pixel}&ev=PageView&noscript=1`}
            />
          </noscript>
        </>
      )}

      {/* Custom head HTML — appended to document.head client-side. */}
      {headHtml && (
        <Script id="custom-head-html" strategy="afterInteractive">
          {`(function(){
            try {
              var c = document.createElement('div');
              c.innerHTML = ${JSON.stringify(headHtml)};
              while (c.firstChild) document.head.appendChild(c.firstChild);
            } catch (e) { console.warn('custom_head_html injection failed', e); }
          })();`}
        </Script>
      )}

      {/* Custom body-end HTML — rendered inline at the bottom of the page. */}
      {bodyEndHtml && (
        // eslint-disable-next-line react/no-danger
        <div
          data-injected="custom-body-end-html"
          style={{ display: "contents" }}
          dangerouslySetInnerHTML={{ __html: bodyEndHtml }}
        />
      )}
    </>
  );
}
