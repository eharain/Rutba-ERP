import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Check, Copy, Link2, Mail, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  FacebookIcon,
  InstagramIcon,
  PinterestIcon,
  TelegramIcon,
  WhatsAppIcon,
  XIcon,
} from "./brand-icons";

export interface ShareDialogProps {
  /** Absolute URL to share. Prefer the short `/s/<code>` form for products. */
  url: string;
  /** Subject line for email and the dialog heading. */
  title: string;
  /** Share text. Editable in the sheet; platforms that ignore it are noted below. */
  text: string;
  /** Absolute image URL — Pinterest pins it directly rather than scraping. */
  image?: string | null;
  /** True while the brand's own caption is in flight — swaps the label hint only. */
  loadingText?: boolean;
  /** Where the caption came from, surfaced so the shopper knows it is editable. */
  captionSource?: "social-post" | "product" | null;
  /** Fires when the sheet opens/closes — the caller uses it to start fetching. */
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
  className?: string;
}

/**
 * The storefront's share sheet.
 *
 * Two things make this more than a row of links:
 *
 * 1. The text is seeded with the caption the brand actually posted about this
 *    product (fetched by the caller), so a shopper sharing it repeats the
 *    brand's own words rather than a bare URL — and it stays editable, because
 *    the person sharing knows their audience better than the caption does.
 * 2. Text and URL are passed separately to every target. Most compose them
 *    themselves, so baking the link into the text posts it twice.
 *
 * Facebook and LinkedIn ignore supplied text entirely (Facebook removed `quote`
 * support) — they scrape the destination's Open Graph tags instead, which is
 * why the product page carries a full OG block. Instagram has no web share
 * intent at all, so its button copies the text and link for pasting.
 */
export default function ShareDialog({
  url,
  title,
  text,
  image,
  loadingText = false,
  captionSource = null,
  onOpenChange,
  trigger,
  className,
}: ShareDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(text);
  const [copied, setCopied] = useState<"link" | "text" | null>(null);
  const [canNativeShare, setCanNativeShare] = useState(false);

  // The caption arrives after the sheet opens. Adopt it unless the shopper has
  // already started editing — overwriting someone mid-sentence is worse than
  // showing the fallback.
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched) setMessage(text);
  }, [text, touched]);

  // navigator.share is absent on most desktops and, on iOS, only exists in a
  // secure context. Probed in an effect so SSR and first paint agree.
  useEffect(() => {
    setCanNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  const targets = useMemo(() => {
    const t = encodeURIComponent(message);
    const u = encodeURIComponent(url);
    const both = encodeURIComponent(message ? `${message}\n\n${url}` : url);
    return [
      {
        key: "whatsapp",
        label: "WhatsApp",
        href: `https://wa.me/?text=${both}`,
        Icon: WhatsAppIcon,
        className: "bg-[#25D366] text-white hover:bg-[#1eb857]",
      },
      {
        key: "facebook",
        label: "Facebook",
        href: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
        Icon: FacebookIcon,
        className: "bg-[#1877F2] text-white hover:bg-[#1665d8]",
      },
      {
        key: "x",
        label: "X",
        href: `https://twitter.com/intent/tweet?text=${t}&url=${u}`,
        Icon: XIcon,
        className: "bg-foreground text-background hover:opacity-90",
      },
      {
        key: "pinterest",
        label: "Pinterest",
        href: `https://www.pinterest.com/pin/create/button/?url=${u}&description=${t}${
          image ? `&media=${encodeURIComponent(image)}` : ""
        }`,
        Icon: PinterestIcon,
        className: "bg-[#E60023] text-white hover:bg-[#c9001f]",
      },
      {
        key: "telegram",
        label: "Telegram",
        href: `https://t.me/share/url?url=${u}&text=${t}`,
        Icon: TelegramIcon,
        className: "bg-[#26A5E4] text-white hover:bg-[#1f92cc]",
      },
      {
        key: "email",
        label: "Email",
        href: `mailto:?subject=${encodeURIComponent(title)}&body=${both}`,
        Icon: Mail,
        className: "bg-secondary text-foreground hover:bg-secondary/70",
      },
    ];
  }, [message, url, image, title]);

  const copy = async (value: string, kind: "link" | "text") => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
    } catch {
      // Clipboard is blocked outside a secure context and in some in-app
      // browsers. Say so rather than silently doing nothing.
      toast({
        title: "Couldn't copy",
        description: "Your browser blocked clipboard access — select the text and copy it manually.",
        variant: "destructive",
      });
    }
  };

  const nativeShare = async () => {
    try {
      await navigator.share({ title, text: message, url });
    } catch {
      // AbortError when the user dismisses the OS sheet — not worth a toast.
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        onOpenChange?.(next);
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="lg" className={cn("rounded-full", className)}>
            <Share2 className="h-4 w-4 mr-2" />
            Share
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Share {title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label htmlFor="share-message" className="text-xs font-bold uppercase tracking-wide">
                Message
              </label>
              <span className="text-[11px] text-muted-foreground">
                {loadingText
                  ? "Checking our latest post…"
                  : captionSource === "social-post"
                  ? "From our latest post — edit as you like"
                  : null}
              </span>
            </div>
            {/* The box keeps showing the fallback text while the caption loads
                rather than blanking. Blanking it would contradict the share
                buttons, which stay armed with that same fallback the whole
                time — someone who taps WhatsApp early would send text the
                dialog was telling them did not exist. */}
            <textarea
              id="share-message"
              value={message}
              onChange={(e) => {
                setTouched(true);
                setMessage(e.target.value);
              }}
              rows={5}
              className={cn(
                "w-full rounded-xl border border-border bg-background p-3 text-sm",
                "focus:outline-none focus:border-foreground/40 resize-y"
              )}
            />
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {targets.map(({ key, label, href, Icon, className: tone }) => (
              <a
                key={key}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                title={`Share on ${label}`}
                className={cn(
                  "flex flex-col items-center justify-center gap-1.5 rounded-xl py-3 transition-all",
                  tone
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-semibold tracking-wide">{label}</span>
              </a>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="rounded-full flex-1 min-w-[9rem]"
              onClick={() => copy(url, "link")}
            >
              {copied === "link" ? (
                <Check className="h-4 w-4 mr-2 text-brand" />
              ) : (
                <Link2 className="h-4 w-4 mr-2" />
              )}
              {copied === "link" ? "Link copied" : "Copy link"}
            </Button>

            {/* Instagram has no web share intent — the only way in is the
                clipboard, so this button prepares the paste rather than
                pretending to open an app that will not accept it. */}
            <Button
              variant="outline"
              className="rounded-full flex-1 min-w-[9rem]"
              onClick={() => copy(message ? `${message}\n\n${url}` : url, "text")}
            >
              {copied === "text" ? (
                <Check className="h-4 w-4 mr-2 text-brand" />
              ) : (
                <InstagramIcon className="h-4 w-4 mr-2" />
              )}
              {copied === "text" ? "Copied for Instagram" : "Copy for Instagram"}
            </Button>

            {canNativeShare && (
              <Button className="rounded-full flex-1 min-w-[9rem]" onClick={nativeShare}>
                <Share2 className="h-4 w-4 mr-2" />
                More apps
              </Button>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground">
            <Copy className="h-3 w-3 inline mr-1 -mt-0.5" />
            Facebook shows the page&apos;s own title and photo instead of your message.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
