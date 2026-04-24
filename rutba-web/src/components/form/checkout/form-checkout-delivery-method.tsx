import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Spinner from "@/components/ui/spinner";
import { useStoreCheckout } from "@/store/store-checkout";
import { DeliveryMethodOption } from "@/types/api/delivery";
import { currencyFormat } from "@/lib/use-currency";
import { TruckIcon, PackageIcon, GlobeIcon, CheckCircleIcon } from "lucide-react";

function ProviderIcon({ provider }: { provider: string }) {
  if (provider === "own_rider") return <TruckIcon className="h-5 w-5 text-green-600" />;
  if (provider === "easypost") return <GlobeIcon className="h-5 w-5 text-blue-600" />;
  return <PackageIcon className="h-5 w-5 text-gray-500" />;
}

export default function FormCheckoutDeliveryMethod({
  onConfirm,
  isPlacingOrder = false,
}: {
  onConfirm: () => void;
  isPlacingOrder?: boolean;
}) {
  const {
    availableDeliveryMethods,
    selectedDeliveryMethod,
    setSelectedDeliveryMethod,
    isLoadingDeliveryMethods,
  } = useStoreCheckout();

  if (isLoadingDeliveryMethods) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner />
        <p className="ml-3 text-sm text-slate-500">Fetching delivery options…</p>
      </div>
    );
  }

  if (availableDeliveryMethods.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-slate-500">
        <PackageIcon className="mx-auto mb-3 h-8 w-8 text-slate-400" />
        <p className="font-semibold">No delivery options available</p>
        <p className="mt-1">Please contact us to arrange shipping for your location.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Select how you would like to receive your order.
      </p>

      <div className="flex flex-col gap-3">
        {availableDeliveryMethods.map((method: DeliveryMethodOption) => {
          const isSelected = selectedDeliveryMethod?.methodDocumentId === method.methodDocumentId;
          return (
            <Card
              key={method.methodDocumentId}
              onClick={() => setSelectedDeliveryMethod(method)}
              className={`cursor-pointer transition-all ${
                isSelected
                  ? "border-2 border-black bg-slate-50"
                  : "hover:border-slate-400"
              }`}
            >
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <ProviderIcon provider={method.serviceProvider} />
                  <div>
                    <p className="font-semibold text-sm">{method.name}</p>
                    {method.description && (
                      <p className="text-xs text-slate-500">{method.description}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-0.5">
                      Est. {method.estimatedDaysMin}–{method.estimatedDaysMax} day
                      {method.estimatedDaysMax > 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    {method.isFreeShipping ? (
                      <span className="text-green-600 font-bold text-sm">FREE</span>
                    ) : (
                      <span className="font-bold text-sm">{currencyFormat(method.cost)}</span>
                    )}
                    {method.serviceProvider === "own_rider" && (
                      <p className="text-xs text-green-600">Own Rider</p>
                    )}
                  </div>
                  {isSelected && (
                    <CheckCircleIcon className="h-5 w-5 text-black flex-shrink-0" />
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Button
        className="mt-4 w-full"
        disabled={!selectedDeliveryMethod || isPlacingOrder}
        onClick={onConfirm}
      >
        {isPlacingOrder && (
          <span className="mr-2 inline-flex">
            <Spinner />
          </span>
        )}
        {isPlacingOrder
          ? "Placing Order…"
          : `Place Order with ${selectedDeliveryMethod?.name ?? "selected method"}`}
      </Button>
    </div>
  );
}
