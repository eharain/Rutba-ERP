import HeaderTopPromo from "@/components/layouts/header-top-promo";
import Link from "next/link";
import { getPageUrl } from "@/lib/cms-page-types";
import { useSiteSettings } from "@/hooks/use-site-settings";

import { ChevronRight, Menu, PanelLeft, ShoppingBasket, User2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuViewport,
} from "@/components/ui/navigation-menu";
import NextImage from "@/components/next-image";
import Cart from "@/components/cart";
import SearchInput from "../search";
import MenuSideBarMobile from "./menu-sidebar-mobile";
import TopMenu from "./top-menu";
import MenuSidebar from "./menu-sidebar";

import { useQuery } from "@tanstack/react-query";
import { SkeletonBrand, SkeletonCategory } from "../skeleton";
import { ErrorCard } from "../errors/error-card";
import { IMAGE_URL } from "@/static/const";
import { resolveMediaUrl } from "@/lib/media-url";
import { useStoreCart } from "@/store/store-cart";
import { useSession } from "next-auth/react";
import { createWebCmsPagesService } from "@/services/";
import { usePageMenu } from "@/hooks/use-menus";
import { PageMenuRef } from "@/types/api/menu";
import { BrandInterface } from "@/types/api/brand";
import { CategoryInterface } from "@/types/api/category";
import { BASE_URL } from "@/static/const";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

function BrandHeader({ brands }: { brands: BrandInterface[] }) {
  return (
    <ul className="grid w-[240px] p-1.5">
      {brands.map((item) => (
        <li key={"brand-list-header" + item.id}>
          <Link
            className="px-3 py-2.5 flex items-center rounded-md hover:bg-secondary transition-colors"
            href={`/product?brand=${item.slug}`}
          >
            <div className="h-8 w-8 flex items-center justify-center rounded-full bg-secondary overflow-hidden mr-3 shrink-0">
              <NextImage
                src={IMAGE_URL + (item.logo?.url ?? "")}
                width={32}
                height={32}
                useSkeleton
                alt={item.name}
              />
            </div>
            <p className="text-sm font-medium">{item.name}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function CategoryHeader({ categories }: { categories: CategoryInterface[] }) {
  return (
    <ul className="grid w-[420px] p-1.5">
      {categories.map((item) => (
        <li key={"category-list-header-" + item.id}>
          <Link
            className="group p-3.5 flex items-center justify-between rounded-md hover:bg-secondary transition-colors"
            href={`/product?category=${item.slug}`}
          >
            <div className="min-w-0">
              <p className="font-semibold text-sm group-hover:text-brand transition-colors">
                {item.name}
              </p>
              {item.short_description && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                  {item.short_description}
                </p>
              )}
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-brand group-hover:translate-x-0.5 transition-all" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function Header({ pageMenus }: { pageMenus?: PageMenuRef[] }) {
  const { cartItem } = useStoreCart();
  const session = useSession();
  const cmsPagesService = createWebCmsPagesService({ baseURL: BASE_URL });
  const settings = useSiteSettings();

  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const {
    data: cmsPage,
    isLoading: isCmsLoading,
    isError: isCmsError,
    error: cmsError,
  } = useQuery({
    queryKey: ["cms-header-data"],
    queryFn: () => cmsPagesService.getCmsHeaderData(),
    staleTime: Infinity,
  });

  const brands = cmsPage?.brand_groups?.flatMap((g) => g.brands ?? []) ?? [];
  const categories =
    cmsPage?.category_groups?.flatMap((g) => g.categories ?? []) ?? [];
  const pinnedPages = cmsPage?.footer?.pinned_pages ?? [];

  // CMS-driven navigation. A page's own menu assignment wins; otherwise the
  // site-wide default menu for the position is used. When neither exists we
  // fall back to the legacy category/brand + pinned-pages nav so the header is
  // never blank before any menu has been authored.
  const topMenu = usePageMenu("top", pageMenus);
  const sideMenu = usePageMenu("side", pageMenus);

  return (
    <>
      <HeaderTopPromo />
      <header
        className={cn(
          "sticky top-0 z-40 w-full transition-all duration-300 ease-smooth",
          scrolled
            ? "bg-background/85 backdrop-blur-md border-b border-border shadow-card"
            : "bg-background border-b border-transparent"
        )}
      >
        <div className="container-fluid">
          <div
            className={cn(
              "flex items-center justify-between transition-all duration-300 ease-smooth",
              scrolled ? "py-3" : "py-5"
            )}
          >
            <div className="flex items-center min-w-0">
              <Link href="/" className="shrink-0">
                {settings.site_logo?.url ? (
                  <img
                    src={resolveMediaUrl(settings.site_logo.url)}
                    alt={settings.site_name}
                    className={cn(
                      "w-auto transition-all duration-300 ease-smooth mr-8",
                      scrolled ? "h-7 md:h-8" : "h-8 md:h-10"
                    )}
                  />
                ) : (
                  <p className="font-display text-2xl font-bold mr-8 tracking-tight">
                    {settings.site_name}
                  </p>
                )}
              </Link>

              <div className="hidden md:block min-w-0 max-w-md w-full">
                <SearchInput />
              </div>
            </div>

            <div className="flex items-center gap-1 md:gap-2">
              {sideMenu && sideMenu.items.length > 0 && (
                <MenuSidebar
                  menu={sideMenu}
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="hidden md:inline-flex rounded-full hover:bg-secondary"
                      aria-label={sideMenu.title || sideMenu.name}
                    >
                      <PanelLeft className="h-5 w-5" />
                    </Button>
                  }
                />
              )}

              {topMenu ? (
                <TopMenu items={topMenu.items} />
              ) : (
                <NavigationMenu className="hidden md:block">
                  <NavigationMenuList className="gap-0.5">
                    {categories.length > 0 && (
                      <NavigationMenuItem>
                        <NavigationMenuTrigger className="text-sm font-medium hover:text-brand data-[state=open]:text-brand">
                          {settings.nav_explore_products_label || "Explore Products"}
                        </NavigationMenuTrigger>
                        <NavigationMenuContent>
                          {isCmsLoading ? (
                            <SkeletonCategory />
                          ) : isCmsError ? (
                            <ErrorCard message={(cmsError as Error).message} />
                          ) : (
                            <CategoryHeader categories={categories} />
                          )}
                        </NavigationMenuContent>
                      </NavigationMenuItem>
                    )}

                    {brands.length > 0 && (
                      <NavigationMenuItem>
                        <NavigationMenuTrigger className="text-sm font-medium hover:text-brand data-[state=open]:text-brand">
                          {settings.nav_explore_brands_label || "Explore Brands"}
                        </NavigationMenuTrigger>
                        <NavigationMenuContent>
                          {isCmsLoading ? (
                            <SkeletonBrand />
                          ) : isCmsError ? (
                            <ErrorCard message={(cmsError as Error).message} />
                          ) : (
                            <BrandHeader brands={brands} />
                          )}
                        </NavigationMenuContent>
                      </NavigationMenuItem>
                    )}

                    {pinnedPages.length > 0 &&
                      pinnedPages.map((pp) => (
                        <NavigationMenuItem key={pp.documentId}>
                          <Link
                            href={getPageUrl(pp)}
                            className="px-4 py-2 text-sm font-medium hover:text-brand transition-colors"
                          >
                            {pp.title}
                          </Link>
                        </NavigationMenuItem>
                      ))}
                  </NavigationMenuList>

                  <NavigationMenuViewport className="right-0" />
                </NavigationMenu>
              )}

              <Cart
                trigger={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative rounded-full hover:bg-secondary"
                    aria-label="Cart"
                  >
                    <ShoppingBasket className="h-5 w-5" />
                    {cartItem.length > 0 && (
                      <span className="absolute -right-1 -top-1 text-[10px] font-bold bg-brand text-brand-foreground h-5 min-w-5 px-1 flex items-center justify-center rounded-full ring-2 ring-background">
                        {cartItem.length}
                      </span>
                    )}
                  </Button>
                }
              />

              <div className="block md:hidden">
                <MenuSideBarMobile
                  pinnedPages={pinnedPages}
                  menuItems={(topMenu?.items ?? []).concat(sideMenu?.items ?? [])}
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-full"
                      aria-label="Menu"
                    >
                      <Menu className="h-5 w-5" />
                    </Button>
                  }
                />
              </div>

              {session.status === "unauthenticated" && (
                <Button
                  size="sm"
                  asChild
                  className="hidden md:inline-flex rounded-full"
                >
                  <Link href="/login">
                    <span className="lg:hidden">
                      <User2 className="h-4 w-4" />
                    </span>
                    <span className="hidden lg:inline">
                      {settings.nav_login_label || "Login or Register"}
                    </span>
                  </Link>
                </Button>
              )}

              {session.status === "authenticated" && (
                <Button
                  size="sm"
                  asChild
                  variant="outline"
                  className="hidden md:inline-flex rounded-full"
                >
                  <Link href="/profile">
                    <User2 className="h-4 w-4 lg:mr-1.5" />
                    <span className="hidden lg:inline">My Profile</span>
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
