import { z } from "zod";

/* --------------------------- SHIPPING INFORMATION VALIDATION -------------------------- */
export const ValidationShippingInformation = z.object({
  name: z.string().min(1, { message: "Email is required" }),

  email: z
    .string()
    .min(1, { message: "Email is required" })
    .email({ message: "Must be a valid email" }),

  phone_number: z.string().min(1, { message: "Phone number is required" }),

  address: z.string().min(1, { message: "Address is required" }),

  country: z.string().min(1, { message: "Country is required" }),

  state: z.string().min(1, { message: "State is required" }),

  city: z.string().min(1, { message: "State is required" }),

  zip_code: z.string().min(1, { message: "Zip Code is required" }),
});

export type ValidationShippingInformationSchema = z.infer<
  typeof ValidationShippingInformation
>;

/* --------------------------- QUICK ORDER VALIDATION ----------------------------------
 * Minimal contact-only schema for "express" checkout — name + email + phone.
 * The shop then continues the conversation on WhatsApp for delivery details.
 * Use this when the shopper doesn't want to commit to a full address upfront.
 * ----------------------------------------------------------------------------------- */
export const ValidationQuickOrder = z.object({
  name: z.string().min(1, { message: "Your name is required" }),
  email: z
    .string()
    .min(1, { message: "Email is required" })
    .email({ message: "Must be a valid email" }),
  phone_number: z
    .string()
    .min(7, { message: "A valid phone number is required" }),
  note: z.string().optional(),
});

export type ValidationQuickOrderSchema = z.infer<typeof ValidationQuickOrder>;
