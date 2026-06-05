import Footer from "./footer";
import Header from "./header";
import { CmsFooterInterface } from "@/types/api/cms-page";
import { PageMenuRef } from "@/types/api/menu";

interface LayoutMainProps {
  children: React.JSX.Element;
  footer?: CmsFooterInterface;
  /** Per-page menu assignments (a CMS page's `menus`); omit on non-CMS routes. */
  menus?: PageMenuRef[];
}

export default function LayoutMain({ children, footer, menus }: LayoutMainProps) {
  return (
    <>
      <Header pageMenus={menus}></Header>
      {children}
      <Footer footer={footer}></Footer>
    </>
  );
}
