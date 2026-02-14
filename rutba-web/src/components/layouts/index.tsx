import Footer from "./footer";
import Header from "./header";

export default function LayoutMain({ children }: { children: React.JSX.Element }) {
  return (
    <>
      <Header></Header>
      {children}
      <Footer></Footer>
    </>
  );
}
