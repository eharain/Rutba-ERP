import { z } from "zod";

/* ---------------------------- LOGIN VALIDATION ---------------------------- */
export const ValidationFormLogin = z.object({
  email: z
    .string()
    .min(1, { message: "Email is required" })
    .email({ message: "Must be a valid email" }),

  password: z.string().min(1, { message: "Password is required" }),
});

export type ValidationFormLoginSchema = z.infer<typeof ValidationFormLogin>;

/* --------------------------- REGISTER VALIDATION -------------------------- */
export const ValidationFormRegister = z
  .object({
    name: z.string().min(1, { message: "Name is required" }),

    email: z
      .string()
      .min(1, { message: "Email is required" })
      .email({ message: "Must be a valid email" }),

    password: z
      .string()
      .min(6, { message: "Password must be at least 6 characters" }),

    confirmPassword: z
      .string()
      .min(1, { message: "Confirm Password is required" }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: `Passwords don't match`,
  });

export type ValidationFormRegisterSchema = z.infer<
  typeof ValidationFormRegister
>;

/* ------------------------ FORGOT-PASSWORD VALIDATION ----------------------- */
export const ValidationFormForgotPassword = z.object({
  email: z
    .string()
    .min(1, { message: "Email is required" })
    .email({ message: "Must be a valid email" }),
});

export type ValidationFormForgotPasswordSchema = z.infer<
  typeof ValidationFormForgotPassword
>;

/* ------------------------ RESET-PASSWORD VALIDATION ------------------------ */
export const ValidationFormResetPassword = z
  .object({
    password: z
      .string()
      .min(6, { message: "Password must be at least 6 characters" }),
    confirmPassword: z
      .string()
      .min(1, { message: "Confirm Password is required" }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: `Passwords don't match`,
  });

export type ValidationFormResetPasswordSchema = z.infer<
  typeof ValidationFormResetPassword
>;
