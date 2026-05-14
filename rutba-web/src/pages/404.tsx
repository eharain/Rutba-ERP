import Link from "next/link";
import LayoutMain from "@/components/layouts";
import { Button } from "@/components/ui/button";
import { ArrowRight, Home, Search, ShoppingBag } from "lucide-react";
import Seo from "@/components/seo/seo";

export default function NotFound() {
  return (
    <LayoutMain>
      <>
        <Seo
          title="Page not found"
          description="The page you're looking for doesn't exist or has moved."
          noindex
        />

        <section className="container-fluid py-24 md:py-32">
        <div className="max-w-2xl mx-auto text-center">
          <p className="eyebrow mb-3">404 — Not found</p>
          <h1 className="font-display text-6xl md:text-8xl font-bold tracking-tight leading-none">
            Lost the trail
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-md mx-auto">
            The page you're looking for doesn't exist or may have been moved.
            Let's get you back to something you'll love.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="rounded-full h-12 px-6 group">
              <Link href="/">
                <Home className="h-4 w-4 mr-2" />
                Back to home
                <ArrowRight className="h-4 w-4 ml-2 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="rounded-full h-12 px-6"
            >
              <Link href="/product">
                <ShoppingBag className="h-4 w-4 mr-2" />
                Browse products
              </Link>
            </Button>
          </div>

          {/* Quick links */}
          <div className="mt-16 grid grid-cols-2 md:grid-cols-3 gap-3 max-w-xl mx-auto">
            <QuickLink href="/shop" icon={<ShoppingBag className="h-4 w-4" />} label="Shop" />
            <QuickLink href="/product" icon={<Search className="h-4 w-4" />} label="All products" />
            <QuickLink href="/blog" icon={<ArrowRight className="h-4 w-4" />} label="Blog" />
          </div>
        </div>
      </section>
      </>
    </LayoutMain>
  );
}

function QuickLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-2 justify-center rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium hover:border-foreground/40 hover:text-brand transition-colors"
    >
      <span className="text-brand">{icon}</span>
      {label}
    </Link>
  );
}
