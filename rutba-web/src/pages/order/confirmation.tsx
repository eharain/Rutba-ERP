import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import LayoutMain from "@/components/layouts";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle2, MessageCircle, ShoppingBag } from "lucide-react";
import Seo from "@/components/seo/seo";

/**
 * Lands here after a successful order. Pops WhatsApp on mount so the editor
 * conversation starts immediately, and gives the customer a reassuring,
 * brand-coloured confirmation page with a fallback button in case the popup
 * was blocked.
 */
export default function OrderConfirmationPage() {
  const router = useRouter();
  const orderId = (router.query.id as string) || "";
  const waEncoded = (router.query.wa as string) || "";

  const whatsappUrl = waEncoded ? decodeURIComponent(waEncoded) : "";

  // Auto-open WhatsApp once on mount. Some browsers block this; the
  // explicit button below is the recoverable fallback.
  const [popupBlocked, setPopupBlocked] = useState(false);
  useEffect(() => {
    if (!whatsappUrl) return;
    const w = window.open(whatsappUrl, "_blank");
    if (!w) setPopupBlocked(true);
    // Run once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <LayoutMain>
      <>
        <Seo
          title="Order placed"
          description="Your order has been received. We'll continue on WhatsApp."
          noindex
        />

        <section className="container-fluid py-16 md:py-24">
          <div className="max-w-xl mx-auto text-center">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-brand/10 mb-6">
              <CheckCircle2 className="h-8 w-8 text-brand" />
            </div>

            <p className="eyebrow mb-2">Order received</p>
            <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight">
              Thank you — we've got it!
            </h1>
            <p className="mt-4 text-muted-foreground text-base md:text-lg">
              {orderId ? (
                <>
                  Your reference is{" "}
                  <span className="font-mono font-semibold text-foreground">
                    {orderId}
                  </span>
                  .
                </>
              ) : (
                "Your order is in."
              )}{" "}
              We've opened WhatsApp so we can confirm your delivery details and
              payment.
            </p>

            {popupBlocked && whatsappUrl && (
              <div className="mt-6 rounded-xl bg-secondary/60 border border-border px-4 py-3 text-sm text-muted-foreground">
                Looks like your browser blocked the popup.
                Tap the button below to continue on WhatsApp.
              </div>
            )}

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              {whatsappUrl && (
                <Button asChild size="lg" className="rounded-full h-12 px-6 group">
                  <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="h-4 w-4 mr-2" />
                    Open WhatsApp
                    <ArrowRight className="h-4 w-4 ml-2 transition-transform group-hover:translate-x-0.5" />
                  </a>
                </Button>
              )}
              <Button
                asChild
                variant="outline"
                size="lg"
                className="rounded-full h-12 px-6"
              >
                <Link href="/">
                  <ShoppingBag className="h-4 w-4 mr-2" />
                  Continue shopping
                </Link>
              </Button>
            </div>

            <div className="mt-12 rounded-2xl bg-card border border-border p-5 md:p-6 text-left">
              <p className="text-xs uppercase tracking-[0.18em] font-bold text-brand mb-2">
                What happens next
              </p>
              <ol className="space-y-3 text-sm">
                <li className="flex gap-3">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background text-[10px] font-bold shrink-0">
                    1
                  </span>
                  <span>
                    We confirm your order over WhatsApp and share delivery
                    options for your area.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background text-[10px] font-bold shrink-0">
                    2
                  </span>
                  <span>
                    Pay on delivery or via the link we send — whichever you
                    prefer.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand text-brand-foreground text-[10px] font-bold shrink-0">
                    3
                  </span>
                  <span>
                    Track your dispatch from the same WhatsApp thread or this
                    reference number.
                  </span>
                </li>
              </ol>
            </div>
          </div>
        </section>
      </>
    </LayoutMain>
  );
}
