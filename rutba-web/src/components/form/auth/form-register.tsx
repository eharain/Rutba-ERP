import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

import { useState } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ValidationFormRegister,
  ValidationFormRegisterSchema,
} from "@/validations/auth-validation";

import useErrorHandler from "@/hooks/useErrorHandler";
import { createWebAuthService } from "@/services/";
import { BASE_URL } from "@/static/const";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import Link from "next/link";
// import GoogleAuthButton from "./google-auth-button";

const authService = createWebAuthService({ baseURL: BASE_URL });

export default function FormRegister() {
  const { handleRejection } = useErrorHandler();

  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    reset: resetFormRegister,
    formState: { errors },
  } = useForm<ValidationFormRegisterSchema>({
    resolver: zodResolver(ValidationFormRegister),
  });

  const [showRegisteredAlert, setShowRegisteredAlert] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">(
    "idle"
  );

  const onRegisterWithCredential: SubmitHandler<
    ValidationFormRegisterSchema
  > = async (data) => {
    try {
      setIsLoading(true);
      await authService.signUpWithCredential({
        name: data.name,
        email: data.email,
        password: data.password,
      });

      resetFormRegister();

      setRegisteredEmail(data.email);
      setResendState("idle");
      setShowRegisteredAlert(true);
      setIsLoading(false);
    } catch (error) {
      handleRejection(error);
      setIsLoading(false);
    }
  };

  const onResendConfirmation = async () => {
    if (!registeredEmail) return;
    try {
      setResendState("sending");
      await authService.resendConfirmation(registeredEmail);
      setResendState("sent");
    } catch (error) {
      setResendState("idle");
      handleRejection(error);
    }
  };

  return (
    <>
      {showRegisteredAlert && (
        <Alert variant={"default"} className="bg-green-600 text-white">
          <AlertTitle>Almost there — verify your email 📧</AlertTitle>
          <AlertDescription className="text-sm">
            We&apos;ve sent a verification link to{" "}
            <strong>{registeredEmail}</strong>. Click it to activate your
            account, then log in to start shopping.
          </AlertDescription>
          <div className="mt-2 flex items-center gap-3 text-sm">
            <Link href="/login" className="underline">
              Go to login
            </Link>
            <span aria-hidden>·</span>
            {resendState === "sent" ? (
              <span className="opacity-90">Verification email re-sent.</span>
            ) : (
              <button
                type="button"
                onClick={onResendConfirmation}
                disabled={resendState === "sending"}
                className="underline disabled:opacity-60"
              >
                {resendState === "sending"
                  ? "Resending…"
                  : "Didn't get it? Resend"}
              </button>
            )}
          </div>
        </Alert>
      )}

      <form
        onSubmit={handleSubmit(onRegisterWithCredential)}
        className="space-y-4"
      >
        <div>
          <Label htmlFor="name">Name</Label>
          <Input
            {...register("name")}
            id="name"
            type="text"
            placeholder="eg. John Doe"
            autoComplete="name"
          />
          {errors.name && (
            <p className="text-xs italic text-red-500 mt-2">
              {errors.name?.message}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            {...register("email")}
            type="email"
            id="email"
            placeholder="johndoe@example.com"
            autoComplete="email"
          />
          {errors.email && (
            <p className="text-xs italic text-red-500 mt-2">
              {errors.email?.message}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            {...register("password")}
            type="password"
            id="password"
            placeholder="At least 6 characters"
            autoComplete="new-password"
          />
          {errors.password && (
            <p className="text-xs italic text-red-500 mt-2">
              {errors.password?.message}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="confirm-password">Confirm Password</Label>
          <Input
            {...register("confirmPassword")}
            type="password"
            id="confirm-password"
            placeholder="Re-enter your password"
            autoComplete="new-password"
          />
          {errors.confirmPassword && (
            <p className="text-xs italic text-red-500 mt-2">
              {errors.confirmPassword?.message}
            </p>
          )}
        </div>

        <Button className="w-full" type="submit" disabled={isLoading}>
          {isLoading ? "Please Wait..." : "Register"}
        </Button>
      </form>

      {/* <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">
            Or continue with
          </span>
        </div>
      </div>

      <GoogleAuthButton></GoogleAuthButton> */}
    </>
  );
}
