import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  CloudOff,
  Pencil,
  MapPin,
  Trash2,
  Plus,
  Save,
  X,
  Star,
  Check,
  Loader2,
} from "lucide-react";
import {
  useSavedCustomer,
  hasShippingAddress,
  formatAddressLine,
  type SavedCustomer,
} from "@/store/store-customer";
import { useToast } from "@/components/ui/use-toast";
import {
  createMeAddressesService,
  formatAddressLines,
  type AddressInput,
  type CustomerAddress,
} from "@/services/me-addresses";

const ADDRESSES_QUERY_KEY = ["me-addresses"];

/**
 * Profile → Saved Address card.
 *
 * Logged-in shoppers see a server-side address book (multiple addresses with
 * one default). Anonymous shoppers fall back to the localStorage single-address
 * store used by checkout's "Shipping to: …" hint.
 */
export default function FormShippingInformation() {
  const session = useSession();
  const jwt = session.data?.jwt as string | undefined;
  const isLoggedIn = !!jwt;

  if (isLoggedIn) {
    return <ServerAddressBook jwt={jwt!} />;
  }
  return <AnonymousAddressCard />;
}

function ServerAddressBook({ jwt }: { jwt: string }) {
  const service = useMemo(() => createMeAddressesService(), []);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const {
    data: addresses = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ADDRESSES_QUERY_KEY,
    queryFn: () => service.list(jwt),
  });

  const [editing, setEditing] = useState<null | { documentId?: string; draft: AddressInput }>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ADDRESSES_QUERY_KEY });

  const createMut = useMutation({
    mutationFn: (data: AddressInput) => service.create(data, jwt),
    onSuccess: () => {
      invalidate();
      setEditing(null);
      toast({ duration: 2500, title: "Address added" });
    },
    onError: (err) => {
      toast({
        title: "Couldn't save",
        description: (err as Error).message,
        variant: "destructive",
      });
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ documentId, data }: { documentId: string; data: AddressInput }) =>
      service.update(documentId, data, jwt),
    onSuccess: () => {
      invalidate();
      setEditing(null);
      toast({ duration: 2500, title: "Address updated" });
    },
    onError: (err) => {
      toast({
        title: "Couldn't update",
        description: (err as Error).message,
        variant: "destructive",
      });
    },
  });

  const removeMut = useMutation({
    mutationFn: (documentId: string) => service.remove(documentId, jwt),
    onSuccess: () => {
      invalidate();
      toast({ duration: 2500, title: "Address removed" });
    },
  });

  const makeDefaultMut = useMutation({
    mutationFn: (documentId: string) => service.makeDefault(documentId, jwt),
    onSuccess: () => {
      invalidate();
      toast({ duration: 2000, title: "Default updated" });
    },
  });

  const startAdd = () => setEditing({ draft: {} });
  const startEdit = (row: CustomerAddress) =>
    setEditing({
      documentId: row.documentId,
      draft: {
        label: row.label,
        name: row.name,
        email: row.email,
        phone: row.phone,
        line1: row.line1,
        line2: row.line2,
        city: row.city,
        state: row.state,
        country: row.country,
        zip_code: row.zip_code,
      },
    });

  const handleSave = () => {
    if (!editing) return;
    if (!editing.draft.phone?.trim()) {
      toast({
        title: "Phone is required",
        description: "We need a number to confirm orders on WhatsApp.",
        variant: "destructive",
      });
      return;
    }
    if (editing.documentId) {
      updateMut.mutate({ documentId: editing.documentId, data: editing.draft });
    } else {
      createMut.mutate(editing.draft);
    }
  };

  const handleDelete = (row: CustomerAddress) => {
    if (!confirm(`Remove "${row.label || formatAddressLines(row) || "this address"}"?`)) return;
    removeMut.mutate(row.documentId);
  };

  const saving = createMut.isPending || updateMut.isPending;

  return (
    <Card className="rounded-2xl">
      <CardHeader className="space-y-1.5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="font-display text-xl font-bold tracking-tight">Saved addresses</p>
            <p className="text-sm text-muted-foreground">
              Manage where we ship your orders. One address is the default.
            </p>
          </div>
          {!editing && (
            <Button onClick={startAdd} size="sm" className="rounded-full">
              <Plus className="h-4 w-4 mr-1" />
              Add address
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading your addresses…
          </div>
        )}

        {isError && addresses.length === 0 && (
          <Alert variant="destructive">
            <AlertTitle>Couldn't load addresses</AlertTitle>
            <AlertDescription>
              Try refreshing the page. If it keeps happening, message us on WhatsApp.
            </AlertDescription>
          </Alert>
        )}

        {!isLoading && !isError && !editing && addresses.length === 0 && (
          <div className="rounded-xl bg-secondary/40 border border-border p-5 text-center">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand/15 text-brand mb-3">
              <MapPin className="h-5 w-5" />
            </span>
            <p className="font-semibold mb-1">No addresses yet</p>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
              Add one and your future orders will skip the form. You can keep
              multiple — home, office, anywhere you ship to.
            </p>
            <Button onClick={startAdd} size="sm" className="rounded-full">
              <Plus className="h-4 w-4 mr-1" />
              Add address
            </Button>
          </div>
        )}

        {!editing &&
          addresses.map((row) => (
            <AddressRow
              key={row.documentId}
              row={row}
              busy={makeDefaultMut.isPending || removeMut.isPending}
              onEdit={() => startEdit(row)}
              onDelete={() => handleDelete(row)}
              onMakeDefault={() => makeDefaultMut.mutate(row.documentId)}
            />
          ))}

        {editing && (
          <AddressEditor
            draft={editing.draft}
            onChange={(next) => setEditing({ ...editing, draft: next })}
            onSave={handleSave}
            onCancel={() => setEditing(null)}
            saving={saving}
            isNew={!editing.documentId}
          />
        )}

        <Alert className="bg-brand/5 border-brand/30">
          <Check className="h-4 w-4" />
          <AlertTitle className="font-semibold">Synced to your account</AlertTitle>
          <AlertDescription className="text-xs leading-relaxed">
            These addresses follow you across devices. Your default appears
            pre-filled at checkout.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

function AddressRow({
  row,
  busy,
  onEdit,
  onDelete,
  onMakeDefault,
}: {
  row: CustomerAddress;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onMakeDefault: () => void;
}) {
  const line = formatAddressLines(row);
  return (
    <div className="rounded-xl bg-secondary/30 border border-border p-4">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand/15 text-brand shrink-0">
          <MapPin className="h-4 w-4" />
        </span>
        <div className="flex-1 min-w-0 text-sm leading-relaxed">
          <div className="flex items-center gap-2 flex-wrap">
            {row.label && <p className="font-semibold">{row.label}</p>}
            {row.is_default && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand/15 text-brand text-[10px] font-bold uppercase tracking-wider px-2 py-0.5">
                <Star className="h-3 w-3" />
                Default
              </span>
            )}
          </div>
          {row.name && <p className="font-medium">{row.name}</p>}
          {line && <p className="text-muted-foreground">{line}</p>}
          {row.zip_code && <p className="text-muted-foreground">{row.zip_code}</p>}
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {row.phone && <span>📱 {row.phone}</span>}
            {row.email && <span>✉️ {row.email}</span>}
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {!row.is_default && (
          <Button
            onClick={onMakeDefault}
            disabled={busy}
            variant="outline"
            size="sm"
            className="rounded-full"
          >
            <Star className="h-3.5 w-3.5 mr-1" />
            Make default
          </Button>
        )}
        <Button
          onClick={onEdit}
          variant="outline"
          size="sm"
          className="rounded-full"
        >
          <Pencil className="h-3.5 w-3.5 mr-1" />
          Edit
        </Button>
        <Button
          onClick={onDelete}
          disabled={busy}
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5 mr-1" />
          Remove
        </Button>
      </div>
    </div>
  );
}

function AddressEditor({
  draft,
  onChange,
  onSave,
  onCancel,
  saving,
  isNew,
}: {
  draft: AddressInput;
  onChange: (next: AddressInput) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  isNew: boolean;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-border p-4">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-sm">
          {isNew ? "Add a new address" : "Edit address"}
        </p>
      </div>
      <Field
        id="sa-label"
        label="Label (optional)"
        placeholder="Home, Office, Mum's place…"
        value={draft.label}
        onChange={(v) => onChange({ ...draft, label: v })}
      />
      <Field
        id="sa-name"
        label="Name"
        placeholder="Ayesha Khan"
        value={draft.name}
        onChange={(v) => onChange({ ...draft, name: v })}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field
          id="sa-phone"
          label="Phone"
          type="tel"
          placeholder="+92 312 3456789"
          value={draft.phone}
          onChange={(v) => onChange({ ...draft, phone: v })}
        />
        <Field
          id="sa-email"
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={draft.email}
          onChange={(v) => onChange({ ...draft, email: v })}
        />
      </div>
      <Field
        id="sa-line1"
        label="Street address"
        placeholder="Street, area, landmark"
        value={draft.line1}
        onChange={(v) => onChange({ ...draft, line1: v })}
      />
      <Field
        id="sa-line2"
        label="Apartment, suite, etc. (optional)"
        placeholder="Floor, unit number, etc."
        value={draft.line2}
        onChange={(v) => onChange({ ...draft, line2: v })}
      />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field
          id="sa-city"
          label="City"
          placeholder="Islamabad"
          value={draft.city}
          onChange={(v) => onChange({ ...draft, city: v })}
        />
        <Field
          id="sa-state"
          label="State / Province"
          placeholder="Punjab"
          value={draft.state}
          onChange={(v) => onChange({ ...draft, state: v })}
        />
        <Field
          id="sa-zip"
          label="ZIP / Postal code"
          placeholder="44000"
          value={draft.zip_code}
          onChange={(v) => onChange({ ...draft, zip_code: v })}
        />
      </div>
      <Field
        id="sa-country"
        label="Country"
        placeholder="PK"
        value={draft.country}
        onChange={(v) => onChange({ ...draft, country: v })}
      />

      <div className="flex flex-wrap gap-2 pt-2">
        <Button
          onClick={onSave}
          size="sm"
          disabled={saving}
          className="rounded-full"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5 mr-1" />
          )}
          Save
        </Button>
        <Button
          onClick={onCancel}
          variant="outline"
          size="sm"
          disabled={saving}
          className="rounded-full"
        >
          <X className="h-3.5 w-3.5 mr-1" />
          Cancel
        </Button>
      </div>
    </div>
  );
}

/* ── Anonymous (localStorage) fallback ──────────────────────────────────── */

function AnonymousAddressCard() {
  const customer = useSavedCustomer((s) => s.customer);
  const save = useSavedCustomer((s) => s.save);
  const clear = useSavedCustomer((s) => s.clear);
  const { toast } = useToast();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SavedCustomer>({});

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
      description: "Stored on this device. Sign in to sync across devices.",
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
              We'll pre-fill your next checkout from this. Stored on this device.
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
        {!editing && !anyContact && !addressKnown && (
          <div className="rounded-xl bg-secondary/40 border border-border p-5 text-center">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand/15 text-brand mb-3">
              <MapPin className="h-5 w-5" />
            </span>
            <p className="font-semibold mb-1">No address on file yet</p>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
              Add one and your future orders will skip the form. Sign in to
              keep multiple and sync across devices.
            </p>
            <Button onClick={startEditing} size="sm" className="rounded-full">
              <Plus className="h-4 w-4 mr-1" />
              Add address
            </Button>
          </div>
        )}

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
            Sign in to save multiple addresses and sync them across all your
            devices.
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
