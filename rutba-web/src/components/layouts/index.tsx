import Footer from "./footer";
import Header from "./header";
import { CmsFooterInterface } from "@/types/api/cms-page";

interface LayoutMainProps {
  children: React.JSX.Element;
  footer?: CmsFooterInterface;
}

export default function LayoutMain({ children, footer }: LayoutMainProps) {
  return (
    <>
      <Header></Header>
      {children}
      <Footer footer={footer}></Footer>
    </>
  );
}
