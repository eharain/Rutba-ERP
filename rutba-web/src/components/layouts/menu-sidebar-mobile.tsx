import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import { Button } from "@/components/ui/button";
import SearchModal from "../search/search-modal";
import { ArrowUpRightSquare, FileText, Search, User2 } from "lucide-react";
import Link from "next/link";
import { CmsPageInterface } from "@/types/api/cms-page";
import { getPageUrl } from "@/lib/cms-page-types";
import { useSiteSettings } from "@/hooks/use-site-settings";

export interface propsInterface {
  trigger: React.JSX.Element;
  pinnedPages?: CmsPageInterface[];
}

export default function MenuSideBarMobile(props: propsInterface) {
  const pinnedPages = props.pinnedPages ?? [];
  const settings = useSiteSettings();

  return (
    <Sheet>
      <SheetTrigger asChild>{props.trigger}</SheetTrigger>

      <SheetContent className="flex h-full flex-col">
        <SheetHeader>
          <SheetTitle className="flex justify-start">Menu</SheetTitle>
        </SheetHeader>

        <SearchModal
          trigger={
            <Button variant={"secondary"} className="flex justify-start">
              <Search className="mr-2 h-5"></Search> {settings.nav_search_placeholder || "Search Products"}
            </Button>
          }
        ></SearchModal>

        <Button variant={"secondary"} className="flex justify-start" asChild>
          <Link href="/product">
            <ArrowUpRightSquare className="mr-2 h-5"></ArrowUpRightSquare>{settings.nav_explore_products_label || "Explore Products"}
          </Link>
        </Button>

        {pinnedPages.map((pp) => (
          <Button
            key={pp.documentId}
            variant={"secondary"}
            className="flex justify-start"
            asChild
          >
            <Link href={getPageUrl(pp)}>
              <FileText className="mr-2 h-5"></FileText>
              {pp.title}
            </Link>
          </Button>
        ))}

        <Button className="flex justify-start" asChild>
          <Link href="/login">
            <User2 className="mr-2 h-5"></User2>{settings.nav_login_label || "Login or Register"}
          </Link>
        </Button>
      </SheetContent>
    </Sheet>
  );
}
