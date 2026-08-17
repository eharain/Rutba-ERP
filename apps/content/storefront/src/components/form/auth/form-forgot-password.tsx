import { useState } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, CheckCircle2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import useErrorHandler from "@/hooks/useErrorHandler";
import { createWebAuthService } from "@/services/";
import { BASE_URL } from "@/static/const";
import {
  ValidationFormForgotPassword,
  ValidationFormForgotPasswordSchema,
} from "@/validations/auth-validation";

const authService = createWebAuthService({ baseURL: BASE_URL });

export default function FormForgotPassword() {
  const { handleRejection } = useErrorHandler();
  const [isLoading, setIsLoading] = useState(false);
  // Strapi's /auth/forgot-password returns 200 regardless of whether the email
  // exists (anti-enumeration). We mirror that by showing the same success state
  // either way — the user is told to check their inbox.
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ValidationFormForgotPasswordSchema>({
    resolver: zodResolver(ValidationFormForgotPassword),
  });

  const onSubmit: SubmitHandler<ValidationFormForgotPasswordSchema> = async (
    data
  ) => {
    try {
      setIsLoading(true);
      await authService.forgotPassword(data.email);
      setSubmittedEmail(data.email);
    } catch (error) {
      handleRejection(error);
    } finally {
      setIsLoading(false);
    }
  };

  if (submittedEmail) {
    return (
      <Alert variant="default" className="border-brand/30 bg-brand/5">
        <CheckCircle2 className="h-5 w-5 text-brand" />
        <AlertTitle className="text-foreground">Check your inbox</AlertTitle>
        <AlertDescription className="text-sm text-muted-foreground">
          If an account exists for{" "}
          <span className="font-semibold text-foreground">
            {submittedEmail}
          </span>
          , we&apos;ve sent a link to set a new password. The link expires in
          30 minutes — check your spam folder if you don&apos;t see it.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <Label htmlFor="email">Email</Label>
        <div className="relative mt-1.5">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            {...register("email")}
            type="email"
            id="email"
            placeholder="johndoe@example.com"
            className="pl-9"
            autoComplete="email"
            autoFocus
          />
        </div>
        {errors.email && (
          <p className="text-xs italic text-red-500 mt-2">
            {errors.email?.message}
          </p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? "Sending..." : "Send reset link"}
      </Button>
    </form>
  );
}
