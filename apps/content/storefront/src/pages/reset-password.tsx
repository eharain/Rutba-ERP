import { useRouter } from "next/router";
import Link from "next/link";
import NextImage from "@/components/next-image";
import FormResetPassword from "@/components/form/auth/form-reset-password";
import { Home, KeyRound, ShieldCheck } from "lucide-react";
import Seo from "@/components/seo/seo";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { resolveMediaUrl } from "@/lib/media-url";

export default function ResetPasswordPage() {
  const router = useRouter();
  const settings = useSiteSettings();
  const code =
    typeof router.query.code === "string" ? router.query.code : "";

  return (
    <>
      <Seo
        title="Set new password"
        description="Choose a new password for your account."
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
                  className="h-10 w-auto brightness-0 invert"
                />
              ) : (
                <span className="font-display text-2xl font-bold tracking-tight">
                  {settings.site_name}
                </span>
              )}
            </Link>
            <div className="max-w-sm">
              <p className="eyebrow text-brand-foreground/90">Almost there</p>
              <h2 className="font-display text-3xl md:text-4xl font-bold leading-tight mt-2 drop-shadow-sm">
                One last step.
              </h2>
              <p className="mt-3 text-background/85 text-sm leading-relaxed">
                Pick something memorable — at least 6 characters. We&apos;ll
                sign you in right after.
              </p>
            </div>
          </div>
        </aside>

        {/* Right column — form */}
        <main className="flex flex-col p-6 md:p-10 relative">
          {/* Prominent header — logo + home link */}
          <header className="flex items-center justify-between mb-10 md:mb-14">
            <Link
              href="/"
              className="inline-flex items-center gap-2.5 group"
            >
              {settings.site_logo?.url ? (
                <img
                  src={resolveMediaUrl(settings.site_logo.url)}
                  alt={settings.site_name}
                  className="h-10 md:h-12 w-auto transition-transform group-hover:scale-105"
                />
              ) : (
                <span className="font-display text-xl md:text-2xl font-bold tracking-tight">
                  {settings.site_name}
                </span>
              )}
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-brand transition-colors rounded-full border border-border px-3 py-1.5"
            >
              <Home className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Home</span>
            </Link>
          </header>

          <div className="flex-1 flex items-center justify-center">
            <div className="w-full max-w-sm space-y-7">
              <div>
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand/15 text-brand mb-4">
                  <KeyRound className="h-5 w-5" />
                </span>
                <p className="eyebrow mb-2">New password</p>
                <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
                  Set a new password
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Make it at least 6 characters, and something you&apos;ll
                  remember.
                </p>
              </div>

              <FormResetPassword code={code} />

              <div className="pt-4 border-t border-border">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 text-brand" />
                  Your password is hashed — we never see the plain text.
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  Remembered after all?{" "}
                  <Link
                    href="/login"
                    className="text-brand font-semibold hover:text-foreground"
                  >
                    Back to login
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
