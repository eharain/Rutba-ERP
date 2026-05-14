import Link from "next/link";
import NextImage from "@/components/next-image";
import FormRegister from "@/components/form/auth/form-register";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/router";
import { ArrowLeft, ShieldCheck, Sparkles } from "lucide-react";
import Seo from "@/components/seo/seo";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { resolveMediaUrl } from "@/lib/media-url";

export default function RegisterPage() {
  const router = useRouter();
  const settings = useSiteSettings();

  return (
    <>
      <Seo
        title="Create account"
        description="Create an account to save addresses and orders."
        noindex
      />

      <div className="min-h-screen grid lg:grid-cols-2 bg-background">
        {/* Left rail — brand image */}
        <aside className="relative hidden lg:flex bg-secondary overflow-hidden">
          <NextImage
            src={"/images/bg-auth-2.png"}
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
              <p className="eyebrow text-brand-foreground/90">Join us</p>
              <h2 className="font-display text-3xl md:text-4xl font-bold leading-tight mt-2 drop-shadow-sm">
                A friendlier way to shop.
              </h2>
              <ul className="mt-6 space-y-2.5 text-sm text-background/90">
                <li className="flex items-start gap-2">
                  <Sparkles className="h-4 w-4 mt-0.5 text-brand-foreground shrink-0" />
                  Save addresses for one-tap checkout
                </li>
                <li className="flex items-start gap-2">
                  <Sparkles className="h-4 w-4 mt-0.5 text-brand-foreground shrink-0" />
                  Track every order from one place
                </li>
                <li className="flex items-start gap-2">
                  <Sparkles className="h-4 w-4 mt-0.5 text-brand-foreground shrink-0" />
                  Early access to drops and member-only offers
                </li>
              </ul>
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
            className="hidden lg:inline-flex absolute right-8 top-8 text-sm font-semibold text-muted-foreground hover:text-brand transition-colors"
          >
            Already have an account?{" "}
            <span className="text-brand ml-1">Login →</span>
          </Link>

          <div className="w-full max-w-sm space-y-7 mt-12 lg:mt-0">
            <div>
              <p className="eyebrow mb-2">New here</p>
              <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
                Create your account
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Takes less than a minute. We'll never spam you.
              </p>
            </div>

            <FormRegister />

            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/")}
              className="text-muted-foreground hover:text-foreground -ml-2"
            >
              <ArrowLeft className="h-3.5 w-3.5 mr-1" />
              Back to home
            </Button>

            <div className="pt-4 border-t border-border">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-brand" />
                Your details are encrypted in transit and at rest.
              </p>
              <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
                By creating an account you agree to our{" "}
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
        </main>
      </div>
    </>
  );
}
