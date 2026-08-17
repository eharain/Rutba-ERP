import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SubmitHandler, useForm } from "react-hook-form";
import {
  ValidationQuickOrder,
  ValidationQuickOrderSchema,
} from "@/validations/shipping-information-validation";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Loader2, ShieldCheck } from "lucide-react";

interface Props {
  defaultValues?: Partial<ValidationQuickOrderSchema>;
  onSubmit: (values: ValidationQuickOrderSchema) => void;
  isPlacingOrder?: boolean;
  /** Total to display on the CTA. Optional — caller may render their own total. */
  totalLabel?: string;
}

/**
 * Minimal contact-only checkout form. The shop captures the lead first
 * (name + email + phone + optional note) and continues the rest of the
 * order conversation on WhatsApp. No address, no delivery method, no
 * login required — friction is the enemy of conversion.
 */
export default function FormQuickOrder({
  defaultValues,
  onSubmit,
  isPlacingOrder,
  totalLabel,
}: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ValidationQuickOrderSchema>({
    resolver: zodResolver(ValidationQuickOrder),
    defaultValues: {
      name: "",
      email: "",
      phone_number: "",
      note: "",
      ...defaultValues,
    },
  });

  const submit: SubmitHandler<ValidationQuickOrderSchema> = (values) => {
    onSubmit(values);
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5">
      <div>
        <Label htmlFor="qo-name" className="text-xs uppercase tracking-wide font-bold">
          Your name
        </Label>
        <Input
          id="qo-name"
          autoComplete="name"
          placeholder="e.g. Ayesha Khan"
          className="mt-1.5 h-12 rounded-xl text-base"
          aria-invalid={!!errors.name}
          {...register("name")}
        />
        {errors.name && (
          <p className="text-xs text-destructive mt-1">{errors.name.message}</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="qo-phone" className="text-xs uppercase tracking-wide font-bold">
            Phone (WhatsApp)
          </Label>
          <Input
            id="qo-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+92 312 3456789"
            className="mt-1.5 h-12 rounded-xl text-base"
            aria-invalid={!!errors.phone_number}
            {...register("phone_number")}
          />
          {errors.phone_number && (
            <p className="text-xs text-destructive mt-1">
              {errors.phone_number.message}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="qo-email" className="text-xs uppercase tracking-wide font-bold">
            Email
          </Label>
          <Input
            id="qo-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            className="mt-1.5 h-12 rounded-xl text-base"
            aria-invalid={!!errors.email}
            {...register("email")}
          />
          {errors.email && (
            <p className="text-xs text-destructive mt-1">{errors.email.message}</p>
          )}
        </div>
      </div>

      <div>
        <Label htmlFor="qo-note" className="text-xs uppercase tracking-wide font-bold">
          Anything else?{" "}
          <span className="text-muted-foreground font-medium normal-case tracking-normal">
            (optional)
          </span>
        </Label>
        <textarea
          id="qo-note"
          rows={3}
          placeholder="Delivery address, gift wrapping, preferred contact time…"
          className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
          {...register("note")}
        />
      </div>

      <Button
        type="submit"
        size="lg"
        disabled={isPlacingOrder}
        className="w-full h-14 rounded-full text-base font-bold tracking-wide group"
      >
        {isPlacingOrder ? (
          <>
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            Placing your order…
          </>
        ) : (
          <>
            Place order
            {totalLabel ? (
              <span className="mx-2 opacity-70">·</span>
            ) : null}
            {totalLabel ? <span>{totalLabel}</span> : null}
            <ArrowRight className="h-4 w-4 ml-2 transition-transform group-hover:translate-x-0.5" />
          </>
        )}
      </Button>

      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" />
        We'll confirm on WhatsApp. No account or payment required upfront.
      </p>
    </form>
  );
}
