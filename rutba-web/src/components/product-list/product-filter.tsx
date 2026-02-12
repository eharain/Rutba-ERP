import { Button } from "@/components/ui/button";

import { SlidersHorizontal } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { currencyFormat } from "@/lib/use-currency";
import useCategoriesService from "@/services/categories";
import { useQuery } from "@tanstack/react-query";

export interface Filter {
  category: string | null;
  minPrice: number;
  maxPrice: number;
}

export default function ProductFilter({
  highestPrice,
}: {
  highestPrice: number;
}) {
  const router = useRouter();
  const { query } = router;

  const [isModalOpen, setModalOpen] = useState(false);

  const { getCategories } = useCategoriesService();
  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      return await getCategories();
    },
  });
  const [filterForm, setFilterForm] = useState({
    category: "all",
    minPrice: 0,
    maxPrice: highestPrice,
  });

  const handleFormInput = <T extends keyof Filter>(
    field: T,
    value: Filter[T]
  ) => {
    setFilterForm((prevState) => ({
      ...prevState,
      [field]: value,
    }));

    if (field === "maxPrice" && filterForm.minPrice > filterForm.maxPrice) {
      setFilterForm((prevState) => ({
        ...prevState,
        minPrice: value as number,
      }));
    }
  };

  const submitFilter = () => {
    query.category = filterForm.category;
    query.minPrice = filterForm.minPrice.toString();
    query.maxPrice = filterForm.maxPrice.toString();

    if (filterForm.category === "all") {
      delete query.category;
    }

    router.push({
      pathname: "/product",
      query: query,
    });

    setModalOpen(false);
  };

  useEffect(() => {
    if (query.minPrice) {
      setFilterForm((prevState) => ({
        ...prevState,
        minPrice: parseInt(query.minPrice as string),
      }));
    }

    if (query.maxPrice) {
      setFilterForm((prevState) => ({
        ...prevState,
        maxPrice: parseInt(query.maxPrice as string),
      }));
    }

    if (query.category) {
      setFilterForm((prevState) => ({
        ...prevState,
        category: query.category as string,
      }));
    }
  }, [query]);

  return (
    <>
      <Dialog open={isModalOpen} onOpenChange={setModalOpen}>
        <DialogTrigger asChild>
          <Button variant={"outline"}>
            <SlidersHorizontal className="h-3" />
            Filter Product
            <div className="hidden xl:flex">
              {filterForm.category && (
                <Badge variant={"secondary"} className="ml-1">
                  Shoes For:{" "}
                  <span className="capitalize"> {filterForm.category}</span>
                </Badge>
              )}
              <Badge variant={"secondary"} className="ml-1">
                Min - Max Price: {currencyFormat(filterForm.minPrice)} - {currencyFormat(filterForm.maxPrice)}
              </Badge>
            </div>
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <div>
            <Label htmlFor="category">Category</Label>
            <Select
              onValueChange={(value) => handleFormInput("category", value)}
              defaultValue={filterForm.category}
            >
              <SelectTrigger id="category" className="w-full">
                <SelectValue placeholder="Select One. All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories?.slice(0, 10).map((category) => (
                  <SelectItem key={category.id} value={category.slug}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="mb-3">
            <div className="flex justify-between mb-2">
              <Label className="block">Min Price</Label>
              <p className="text-sm">{currencyFormat(filterForm.minPrice)}</p>
            </div>
            <Slider
              onValueChange={(value) => handleFormInput("minPrice", value[0])}
              defaultValue={[
                filterForm.maxPrice > filterForm.maxPrice
                  ? filterForm.maxPrice
                  : filterForm.minPrice,
              ]}
              max={filterForm.maxPrice}
              step={1}
            />
          </div>

          <div>
            <div className="flex justify-between mb-2">
              <Label className="block">Max Price</Label>
              <p className="text-sm">{currencyFormat(filterForm.maxPrice)}</p>
            </div>
            <Slider
              onValueChange={(value) => handleFormInput("maxPrice", value[0])}
              defaultValue={[filterForm.maxPrice]}
              max={highestPrice}
              step={1}
            />
          </div>

          <DialogFooter>
            <Button onClick={() => submitFilter()}>Filter Now</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
