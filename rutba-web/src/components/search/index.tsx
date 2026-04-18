import { Search } from "lucide-react";
import SearchModal from "./search-modal";
import { useSiteSettings } from "@/hooks/use-site-settings";

export default function SearchInput() {
  const settings = useSiteSettings();
  return (
    <>
      <SearchModal
        trigger={
          <div className="flex relative cursor-pointer">
            <Search />
            <input
              readOnly
              className="ml-4 hidden lg:block lg:w-[145px] xl:w-[250px] cursor-pointer focus:outline-none"
              placeholder={settings.nav_search_placeholder || "Search Products"}
            ></input>
          </div>
        }
      ></SearchModal>
    </>
  );
}
