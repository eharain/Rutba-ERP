import Script from "next/script";
import { CmsFooterInterface } from "@/types/api/cms-page";

interface TrackingScriptsProps {
  footer?: CmsFooterInterface;
}

/**
 * Injects analytics / pixel / GTM scripts based on the active CMS footer.
 *
 * - All IDs are optional — render only what's configured.
 * - `custom_head_html` and `custom_body_end_html` accept editor-pasted raw
 *   markup for partners that don't fit a tidy ID slot (Hotjar, Clarity,
 *   LinkedIn Insight, etc). Both render via dangerouslySetInnerHTML — this
 *   is privileged CMS-authenticated content, not user input.
 * - The "head" custom block is appended to <head> on the client after mount
 *   (SSR-safe, but a small flash before scripts run; acceptable for
 *   analytics).
 *
 * Mount once per page from <Footer>. Next.js dedupes <Script id> if it
 * sneaks in twice through different layouts.
 */
export default function TrackingScripts({ footer }: TrackingScriptsProps) {
  if (!footer) return null;

  const ga = footer.ga_measurement_id?.trim();
  const pixel = footer.meta_pixel_id?.trim();
  const gtm = footer.gtm_container_id?.trim();
  const headHtml = footer.custom_head_html?.trim();
  const bodyEndHtml = footer.custom_body_end_html?.trim();

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
