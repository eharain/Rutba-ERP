// import HeaderTopPromo from "@/components/layouts/header-top-promo";
import Link from "next/link";
import { getPageUrl } from "@/lib/cms-page-types";

import { ChevronRight, Menu, ShoppingBasket, User2 } from "lucide-react";

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

import { useQuery } from "@tanstack/react-query";
import { SkeletonBrand, SkeletonCategory } from "../skeleton";
import { ErrorCard } from "../errors/error-card";
import { IMAGE_URL } from "@/static/const";
import { useStoreCart } from "@/store/store-cart";
import { useSession } from "next-auth/react";
import useCmsPagesService from "@/services/cms-pages";
import { BrandInterface } from "@/types/api/brand";
import { CategoryInterface } from "@/types/api/category";
import { CmsPageInterface } from "@/types/api/cms-page";

function BrandHeader({ brands }: { brands: BrandInterface[] }) {
  return (
    <ul className="grid w-[200px]">
      {brands.map((item) => (
        <li key={"brand-list-header" + item.id}>
          <Link
            className="px-4 py-2 flex items-center hover:bg-slate-100"
            href={`/product?brand=${item.slug}`}
          >
            <NextImage
              src={IMAGE_URL + (item.logo?.url ?? "")}
              width={30}
              height={30}
              useSkeleton
              alt="nike"
            ></NextImage>
            <p className="ml-3">{item.name}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function CategoryHeader({ categories }: { categories: CategoryInterface[] }) {
  return (
    <ul className="grid w-[400px]">
      {categories.map((item) => (
        <li key={"category-list-header-" + item.id}>
          <Link
            className="p-4 flex items-center justify-between hover:bg-slate-100"
            href={`/product?category=${item.slug}`}
          >
            <div>
              <p className="font-bold">{item.name}</p>
              <p className="text-sm">{item.short_description}</p>
            </div>
            <div>
              <ChevronRight />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function Header() {
  const { cartItem } = useStoreCart();
  const session = useSession();
  const { getCmsHeaderData } = useCmsPagesService();

  const {
    data: cmsPage,
    isLoading: isCmsLoading,
    isError: isCmsError,
    error: cmsError,
  } = useQuery({
    queryKey: ["cms-header-data"],
    queryFn: getCmsHeaderData,
    staleTime: Infinity,
  });

  const brands = cmsPage?.brand_groups?.flatMap((g) => g.brands ?? []) ?? [];
  const categories =
    cmsPage?.category_groups?.flatMap((g) => g.categories ?? []) ?? [];
  const pinnedPages = cmsPage?.footer?.pinned_pages ?? [];

  return (
    <>
      {/* <HeaderTopPromo></HeaderTopPromo> */}
      <div className="border-b border-[#DEDEDE]">
        <div className="container-fluid py-6">
          <div className="flex justify-between">
            <div className="flex items-center">
              <Link href={"/"}>
                <p className="text-2xl font-bold mr-10">Rutba.pk</p>
              </Link>

              <div className="flex items-center hidden md:block">
                <SearchInput></SearchInput>
              </div>
            </div>

            <div className="flex items-center">
              <NavigationMenu className="mr-4 hidden md:block">
                <NavigationMenuList>
                  {categories.length > 0 && (
                    <NavigationMenuItem>
                      <NavigationMenuTrigger>
                        Explore Products
                      </NavigationMenuTrigger>
                      <NavigationMenuContent>
                        {isCmsLoading ? (
                          <SkeletonCategory />
                        ) : isCmsError ? (
                          <ErrorCard
                            message={(cmsError as Error).message}
                          />
                        ) : (
                          <CategoryHeader categories={categories} />
                        )}
                      </NavigationMenuContent>
                    </NavigationMenuItem>
                  )}

                  {brands.length > 0 && (
                    <NavigationMenuItem>
                      <NavigationMenuTrigger>
                        Explore Brands
                      </NavigationMenuTrigger>
                      <NavigationMenuContent>
                        {isCmsLoading ? (
                          <SkeletonBrand />
                        ) : isCmsError ? (
                          <ErrorCard
                            message={(cmsError as Error).message}
                          />
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
                          className="px-4 py-2 text-sm font-medium hover:text-gray-600 transition-colors"
                        >
                          {pp.title}
                        </Link>
                      </NavigationMenuItem>
                    ))}
                </NavigationMenuList>

                <NavigationMenuViewport className="right-0"></NavigationMenuViewport>
              </NavigationMenu>

              <div className="cursor-pointer mr-4">
                <Cart
                  trigger={
                    <Button variant="outline" size="icon" className="relative">
                      <ShoppingBasket />
                      <div className="absolute -right-2 -top-2 text-xs bg-black h-5 w-5 flex items-center justify-center rounded-full text-white">
                        {cartItem.length}
                      </div>
                    </Button>
                  }
                ></Cart>
              </div>

              <div className="block md:hidden relative">
                <MenuSideBarMobile
                  pinnedPages={pinnedPages}
                  trigger={
                    <Button variant={"ghost"}>
                      <Menu></Menu>
                    </Button>
                  }
                ></MenuSideBarMobile>
              </div>

              {session.status === "unauthenticated" && (
                <Button size={"sm"} asChild className="hidden md:flex">
                  <Link href="/login">
                    <span className="md:visible lg:hidden">
                      <User2></User2>
                    </span>
                    <span className="hidden lg:block">Login or Register</span>
                  </Link>
                </Button>
              )}

              {session.status === "authenticated" && (
                <Button size={"sm"} asChild className="hidden md:flex">
                  <Link href="/profile">
                    <span>
                      <User2 className="h-4"></User2>
                    </span>
                    <span className="hidden lg:block ml-1">My Profile</span>
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
