import Link from "next/link";
import NextImage from "@/components/next-image";
import FormForgotPassword from "@/components/form/auth/form-forgot-password";
import { ArrowLeft, Key, ShieldCheck } from "lucide-react";
import Seo from "@/components/seo/seo";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { resolveMediaUrl } from "@/lib/media-url";

export default function ForgotPasswordPage() {
  const settings = useSiteSettings();

  return (
    <>
      <Seo
        title="Reset password"
        description="We'll email you a link to set a new password."
        noindex
      />

      <div className="min-h-screen grid lg:grid-cols-2 bg-background">
        {/* Left rail — brand image */}
        <aside className="relative hidden lg:flex bg-secondary overflow-hidden">
          <NextImage
            src={"/images/bg-auth.png"}
            alt="bg-auth"
            width={1920}
            height={800}
            className="object-cover w-full h-full"
            classNames={{
              image: "object-cover w-full h-full",
            }}
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-tr from-foreground/70 via-foreground/30 to-transparent"
          />
          <div className="relative z-10 flex flex-col justify-between p-10 lg:p-12 text-background w-full">
            <Link href="/" className="inline-flex items-center gap-2 w-fit">
              {settings.site_logo?.url ? (
                <img
                  src={resolveMediaUrl(settings.site_logo.url)}
                  alt={settings.site_name}
                  className="h-8 w-auto brightness-0 invert"
                />
              ) : (
                <span className="font-display text-xl font-bold tracking-tight">
                  {settings.site_name}
                </span>
              )}
            </Link>
            <div className="max-w-sm">
              <p className="eyebrow text-brand-foreground/90">No worries</p>
              <h2 className="font-display text-3xl md:text-4xl font-bold leading-tight mt-2 drop-shadow-sm">
                Happens to all of us.
              </h2>
              <p className="mt-3 text-background/85 text-sm leading-relaxed">
                Pop in your email and we'll send a link to set a fresh
                password. Check your spam folder if it doesn't show up in a
                minute or two.
              </p>
            </div>
          </div>
        </aside>

        {/* Right column — form */}
        <main className="flex items-center justify-center p-6 md:p-10 relative">
          <div className="lg:hidden absolute top-5 left-5 right-5 flex items-center justify-between">
            <Link href="/" className="inline-flex items-center gap-2">
              {settings.site_logo?.url ? (
                <img
                  src={resolveMediaUrl(settings.site_logo.url)}
                  alt={settings.site_name}
                  className="h-7 w-auto"
                />
              ) : (
                <span className="font-display text-lg font-bold tracking-tight">
                  {settings.site_name}
                </span>
              )}
            </Link>
            <Link
              href="/login"
              className="text-sm font-semibold text-brand hover:text-foreground transition-colors"
            >
              Login
            </Link>
          </div>

          <Link
            href="/login"
            className="hidden lg:inline-flex absolute right-8 top-8 text-sm font-semibold text-muted-foreground hover:text-brand transition-colors items-center gap-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to login
          </Link>

          <div className="w-full max-w-sm space-y-7 mt-12 lg:mt-0">
            <div>
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand/15 text-brand mb-4">
                <Key className="h-5 w-5" />
              </span>
              <p className="eyebrow mb-2">Reset password</p>
              <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
                Forgot it? No drama.
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Type the email you registered with — we'll email you a link
                to set a new one.
              </p>
            </div>

            <FormForgotPassword />

            <div className="pt-4 border-t border-border">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-brand" />
                Reset links expire after 30 minutes.
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                Remembered it after all?{" "}
                <Link
                  href="/login"
                  className="text-brand font-semibold hover:text-foreground"
                >
                  Back to login
                </Link>
              </p>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
