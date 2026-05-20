import { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { SubmitHandler, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Lock, CheckCircle2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import useErrorHandler from "@/hooks/useErrorHandler";
import { createWebAuthService } from "@/services/";
import { BASE_URL } from "@/static/const";
import {
  ValidationFormResetPassword,
  ValidationFormResetPasswordSchema,
} from "@/validations/auth-validation";

const authService = createWebAuthService({ baseURL: BASE_URL });

interface FormResetPasswordProps {
  code: string;
}

export default function FormResetPassword({ code }: FormResetPasswordProps) {
  const router = useRouter();
  const { handleRejection } = useErrorHandler();
  const [isLoading, setIsLoading] = useState(false);
  const [didReset, setDidReset] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ValidationFormResetPasswordSchema>({
    resolver: zodResolver(ValidationFormResetPassword),
  });

  const onSubmit: SubmitHandler<ValidationFormResetPasswordSchema> = async (
    data
  ) => {
    try {
      setIsLoading(true);
      await authService.resetPassword({
        code,
        password: data.password,
        passwordConfirmation: data.confirmPassword,
      });
      setDidReset(true);
      // Land them on login after a short beat so they can read the confirmation.
      setTimeout(() => router.push("/login"), 2000);
    } catch (error) {
      handleRejection(error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!code) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Missing reset code</AlertTitle>
        <AlertDescription className="text-sm">
          This reset link is incomplete. Request a new one from the{" "}
          <Link
            href="/forgot-password"
            className="underline underline-offset-2 font-semibold"
          >
            forgot password
          </Link>{" "}
          page.
        </AlertDescription>
      </Alert>
    );
  }

  if (didReset) {
    return (
      <Alert variant="default" className="border-brand/30 bg-brand/5">
        <CheckCircle2 className="h-5 w-5 text-brand" />
        <AlertTitle className="text-foreground">Password updated</AlertTitle>
        <AlertDescription className="text-sm text-muted-foreground">
          You can now sign in with your new password. Redirecting you to
          login…
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <Label htmlFor="password">New password</Label>
        <div className="relative mt-1.5">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            {...register("password")}
            type="password"
            id="password"
            placeholder="At least 6 characters"
            className="pl-9"
            autoComplete="new-password"
            autoFocus
          />
        </div>
        {errors.password && (
          <p className="text-xs italic text-red-500 mt-2">
            {errors.password?.message}
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="confirm-password">Confirm new password</Label>
        <div className="relative mt-1.5">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            {...register("confirmPassword")}
            type="password"
            id="confirm-password"
            placeholder="Re-enter new password"
            className="pl-9"
            autoComplete="new-password"
          />
        </div>
        {errors.confirmPassword && (
          <p className="text-xs italic text-red-500 mt-2">
            {errors.confirmPassword?.message}
          </p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? "Updating…" : "Set new password"}
      </Button>
    </form>
  );
}
