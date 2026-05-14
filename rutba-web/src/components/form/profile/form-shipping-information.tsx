import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CloudOff, Pencil, MapPin, Trash2, Plus, Save, X } from "lucide-react";
import {
  useSavedCustomer,
  hasShippingAddress,
  formatAddressLine,
  type SavedCustomer,
} from "@/store/store-customer";
import { useToast } from "@/components/ui/use-toast";

/**
 * Profile → Saved Address card.
 *
 * Backed by the localStorage `saved-customer` store for now. A future
 * iteration will sync this to a Strapi `customer-address` collection so
 * shoppers can keep their book across devices and sessions — that's
 * tracked in docs/todo/address-book-server-side.md.
 */
export default function FormShippingInformation() {
  const customer = useSavedCustomer((s) => s.customer);
  const save = useSavedCustomer((s) => s.save);
  const clear = useSavedCustomer((s) => s.clear);
  const { toast } = useToast();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SavedCustomer>({});

  // Hydrate on mount — zustand-persist hydrates async, so guard against the
  // first SSR pass having an empty record.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    if (!editing) setDraft(customer);
  }, [customer, editing]);

  const startEditing = () => {
    setDraft(customer);
    setEditing(true);
  };

  const handleSave = () => {
    save(draft);
    setEditing(false);
    toast({
      duration: 2500,
      title: "Saved",
      description: "Your shipping details are stored on this device for future orders.",
    });
  };

  const handleClear = () => {
    if (!confirm("Remove your saved shipping details from this device?")) return;
    clear();
    setDraft({});
    setEditing(false);
  };

  if (!hydrated) return null;

  const addressKnown = hasShippingAddress(customer);
  const anyContact = customer.name || customer.email || customer.phone_number;

  return (
    <Card className="rounded-2xl">
      <CardHeader className="space-y-1.5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="font-display text-xl font-bold tracking-tight">Saved address</p>
            <p className="text-sm text-muted-foreground">
              We'll pre-fill your next checkout from this. Stored on this
              device.
            </p>
          </div>
          {!editing && (anyContact || addressKnown) && (
            <Button
              variant="outline"
              size="sm"
              onClick={startEditing}
              className="rounded-full"
            >
              <Pencil className="h-3.5 w-3.5 mr-1" />
              Edit
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Empty state */}
        {!editing && !anyContact && !addressKnown && (
          <div className="rounded-xl bg-secondary/40 border border-border p-5 text-center">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand/15 text-brand mb-3">
              <MapPin className="h-5 w-5" />
            </span>
            <p className="font-semibold mb-1">No address on file yet</p>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
              Add one and your future orders will skip the form. You can also
              just place orders express from checkout — we'll save it then.
            </p>
            <Button onClick={startEditing} size="sm" className="rounded-full">
              <Plus className="h-4 w-4 mr-1" />
              Add address
            </Button>
          </div>
        )}

        {/* Saved view */}
        {!editing && (anyContact || addressKnown) && (
          <div className="rounded-xl bg-secondary/30 border border-border p-4">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand/15 text-brand shrink-0">
                <MapPin className="h-4 w-4" />
              </span>
              <div className="flex-1 min-w-0 text-sm leading-relaxed">
                {customer.name && <p className="font-semibold">{customer.name}</p>}
                {addressKnown && (
                  <p className="text-muted-foreground">{formatAddressLine(customer)}</p>
                )}
                {customer.zip_code && (
                  <p className="text-muted-foreground">{customer.zip_code}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {customer.phone_number && <span>📱 {customer.phone_number}</span>}
                  {customer.email && <span>✉️ {customer.email}</span>}
                </div>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                onClick={handleClear}
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Remove
              </Button>
            </div>
          </div>
        )}

        {/* Editor */}
        {editing && (
          <div className="space-y-3">
            <Field
              id="sa-name"
              label="Name"
              placeholder="Ayesha Khan"
              value={draft.name}
              onChange={(v) => setDraft({ ...draft, name: v })}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                id="sa-phone"
                label="Phone"
                type="tel"
                placeholder="+92 312 3456789"
                value={draft.phone_number}
                onChange={(v) => setDraft({ ...draft, phone_number: v })}
              />
              <Field
                id="sa-email"
                label="Email"
                type="email"
                placeholder="you@example.com"
                value={draft.email}
                onChange={(v) => setDraft({ ...draft, email: v })}
              />
            </div>
            <Field
              id="sa-address"
              label="Street address"
              placeholder="Street, area, landmark"
              value={draft.address}
              onChange={(v) => setDraft({ ...draft, address: v })}
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field
                id="sa-city"
                label="City"
                placeholder="Islamabad"
                value={draft.city}
                onChange={(v) => setDraft({ ...draft, city: v })}
              />
              <Field
                id="sa-state"
                label="State / Province"
                placeholder="Punjab"
                value={draft.state}
                onChange={(v) => setDraft({ ...draft, state: v })}
              />
              <Field
                id="sa-zip"
                label="ZIP / Postal code"
                placeholder="44000"
                value={draft.zip_code}
                onChange={(v) => setDraft({ ...draft, zip_code: v })}
              />
            </div>
            <Field
              id="sa-country"
              label="Country"
              placeholder="PK"
              value={draft.country}
              onChange={(v) => setDraft({ ...draft, country: v })}
            />

            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={handleSave} size="sm" className="rounded-full">
                <Save className="h-3.5 w-3.5 mr-1" />
                Save
              </Button>
              <Button
                onClick={() => setEditing(false)}
                variant="outline"
                size="sm"
                className="rounded-full"
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Cancel
              </Button>
            </div>
          </div>
        )}

        <Alert className="bg-brand/5 border-brand/30">
          <CloudOff className="h-4 w-4" />
          <AlertTitle className="font-semibold">Stored on this device</AlertTitle>
          <AlertDescription className="text-xs leading-relaxed">
            Your saved address lives in this browser for now. We're working on
            an address book that syncs across your devices — coming soon.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

function Field({
  id,
  label,
  type = "text",
  placeholder,
  value,
  onChange,
}: {
  id: string;
  label: string;
  type?: string;
  placeholder?: string;
  value?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label htmlFor={id} className="text-xs uppercase tracking-wide font-bold">
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        placeholder={placeholder}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 h-11 rounded-xl"
      />
    </div>
  );
}
