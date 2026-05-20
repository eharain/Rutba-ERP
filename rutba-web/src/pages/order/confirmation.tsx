import { useRouter } from "next/router";
import LayoutMain from "@/components/layouts";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  MessageCircle,
  ShoppingBag,
} from "lucide-react";
import Seo from "@/components/seo/seo";
import { useState } from "react";

/**
 * Lands here after a successful order. Deliberately does NOT auto-open
 * WhatsApp — popping a new tab on mount yanks the user out of the success
 * page before they can read it, which felt to customers like the order
 * "just disappeared into WhatsApp" without confirmation. The page is now
 * the success surface, and the WhatsApp handoff is a user-initiated CTA.
 */
export default function OrderConfirmationPage() {
  const router = useRouter();
  const orderId = (router.query.id as string) || "";
  const waEncoded = (router.query.wa as string) || "";

  const whatsappUrl = waEncoded ? decodeURIComponent(waEncoded) : "";

  // Lightweight copy-to-clipboard so customers can paste the reference into
  // WhatsApp, email support, or wherever else if the link button doesn't
  // suit them on their device.
  const [copied, setCopied] = useState(false);
  const copyOrderId = async () => {
    if (!orderId) return;
    try {
      await navigator.clipboard.writeText(orderId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — ignore, the id is still visible on screen */
    }
  };

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
              Thank you — your order is in!
            </h1>
            <p className="mt-4 text-muted-foreground text-base md:text-lg">
              We&apos;ve received your order and saved it under the reference
              below. The next step is a quick WhatsApp chat with our team to
              confirm delivery details and arrange payment.
            </p>

            {/* Order reference chip — prominent, copyable, screenshot-friendly */}
            {orderId && (
              <div className="mt-6 inline-flex items-center gap-3 rounded-full bg-secondary/60 border border-border px-4 py-2.5">
                <span className="text-xs uppercase tracking-[0.18em] font-bold text-muted-foreground">
                  Order ref
                </span>
                <span className="font-mono font-semibold text-foreground">
                  {orderId}
                </span>
                <button
                  type="button"
                  onClick={copyOrderId}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:text-foreground transition-colors"
                  aria-label="Copy order reference"
                >
                  <Copy className="h-3 w-3" />
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            )}

            <div className="mt-10 rounded-2xl bg-card border border-border p-5 md:p-6 text-left">
              <p className="text-xs uppercase tracking-[0.18em] font-bold text-brand mb-3">
                What happens next
              </p>
              <ol className="space-y-3 text-sm">
                <li className="flex gap-3">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand text-brand-foreground text-[10px] font-bold shrink-0">
                    1
                  </span>
                  <span>
                    Tap <strong>Continue on WhatsApp</strong> below — your
                    order details are pre-filled so you just need to hit send.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background text-[10px] font-bold shrink-0">
                    2
                  </span>
                  <span>
                    Our team will confirm your delivery address, share shipping
                    options, and answer any questions you have.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background text-[10px] font-bold shrink-0">
                    3
                  </span>
                  <span>
                    Pay on delivery or via the link we send — whichever you
                    prefer. We&apos;ll keep you updated until it&apos;s at your
                    door.
                  </span>
                </li>
              </ol>
            </div>

            {/* Primary CTA — user-initiated, no surprise tab opens. Keeping
                rel="noopener noreferrer" and target="_blank" so a tap on
                mobile opens the WhatsApp app via the deep-link handler
                without losing this page. */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              {whatsappUrl ? (
                <Button asChild size="lg" className="rounded-full h-12 px-6 group">
                  <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="h-4 w-4 mr-2" />
                    Continue on WhatsApp
                    <ArrowRight className="h-4 w-4 ml-2 transition-transform group-hover:translate-x-0.5" />
                  </a>
                </Button>
              ) : null}
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

            <p className="mt-6 text-xs text-muted-foreground">
              Didn&apos;t mean to leave? Save this page or your order
              reference — you can come back to it later.
            </p>
          </div>
        </section>
      </>
    </LayoutMain>
  );
}
