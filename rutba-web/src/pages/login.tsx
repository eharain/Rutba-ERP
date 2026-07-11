import Link from "next/link";
import NextImage from "@/components/next-image";
import FormLogin from "@/components/form/auth/form-login";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { Home, ShieldCheck } from "lucide-react";
import Seo from "@/components/seo/seo";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { resolveMediaUrl } from "@/lib/media-url";

export default function LoginPage() {
  const session = useSession();
  const router = useRouter();
  const settings = useSiteSettings();
  const redirect = router.query.redirect as string | undefined;
  const justConfirmed = router.query.confirmed === "1";

  useEffect(() => {
    if (session.data?.jwt && !redirect) {
      router.push("/");
    }
    if (session.data?.jwt && redirect) {
      router.push(redirect);
    }
  }, [session.data?.jwt, redirect, router]);

  return (
    <>
      <Seo title="Login" description="Sign in to your account." noindex />

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
            <Link href="/" className="inline-flex items-center gap-2 w-fit group">
              {settings.site_logo?.url ? (
                <img
                  src={resolveMediaUrl(settings.site_logo.url)}
                  alt={settings.site_name}
                  className="h-12 w-auto brightness-0 invert transition-transform group-hover:scale-105"
                />
              ) : (
                <span className="font-display text-2xl font-bold tracking-tight">
                  {settings.site_name}
                </span>
              )}
            </Link>
            <div className="max-w-sm">
              <p className="eyebrow text-brand-foreground/90">Welcome back</p>
              <h2 className="font-display text-3xl md:text-4xl font-bold leading-tight mt-2 drop-shadow-sm">
                Pick up where you left off.
              </h2>
              <p className="mt-3 text-background/85 text-sm leading-relaxed">
                Saved addresses, order history, and quick reorders — all
                ready when you are.
              </p>
            </div>
          </div>
        </aside>

        {/* Right column — form */}
        <main className="flex flex-col p-6 md:p-10 relative">
          {/* Prominent header — logo + home link + register shortcut */}
          <header className="flex items-center justify-between mb-10 md:mb-14 gap-3">
            <Link href="/" className="inline-flex items-center gap-2.5 group">
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
            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-brand transition-colors rounded-full border border-border px-3 py-1.5"
              >
                <Home className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Home</span>
              </Link>
              <Link
                href="/register"
                className="text-sm font-semibold text-brand hover:text-foreground transition-colors"
              >
                <span className="hidden sm:inline">New here? </span>
                Create account
              </Link>
            </div>
          </header>

          <div className="flex-1 flex items-center justify-center">
            <div className="w-full max-w-sm space-y-7">
              <div>
                <p className="eyebrow mb-2">Login</p>
                <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
                  Welcome back
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Enter your details and we&apos;ll get you back in.
                </p>
              </div>

              {justConfirmed && (
                <div className="rounded-md border border-green-600/40 bg-green-600/10 px-4 py-3 text-sm text-green-700 dark:text-green-400">
                  Your email is verified — you can now log in.
                </div>
              )}

              <FormLogin />

              <div className="pt-4 border-t border-border">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-brand" />
                Your details are encrypted in transit and at rest.
              </p>
              <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
                By signing in you agree to our{" "}
                <Link
                  href="/page/terms-of-service"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  Terms
                </Link>{" "}
                and{" "}
                <Link
                  href="/page/privacy-policy"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  Privacy Policy
                </Link>
                .
              </p>
            </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
