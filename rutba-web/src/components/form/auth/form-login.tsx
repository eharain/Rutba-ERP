import Link from "next/link";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

import { signIn } from "next-auth/react";
import { SubmitHandler, useForm } from "react-hook-form";

import useErrorHandler from "@/hooks/useErrorHandler";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ValidationFormLogin,
  ValidationFormLoginSchema,
} from "@/validations/auth-validation";
import { useRouter } from "next/router";
// import GoogleAuthButton from "./google-auth-button";
import { useState } from "react";
import { createWebAuthService } from "@/services/";
import { BASE_URL } from "@/static/const";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const authService = createWebAuthService({ baseURL: BASE_URL });

// Strapi returns this message from /auth/local when email_confirmation is on
// and the account hasn't been verified yet.
const isUnconfirmedError = (err: unknown) =>
  typeof err === "string" && /email is not confirmed/i.test(err);

export default function FormLogin() {
  const router = useRouter();
  const { handleRejection } = useErrorHandler();

  const [isLoading, setIsLoading] = useState(false);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">(
    "idle"
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ValidationFormLoginSchema>({
    resolver: zodResolver(ValidationFormLogin),
  });

  const onLoginWithCredential: SubmitHandler<
    ValidationFormLoginSchema
  > = async (data) => {
    try {
      setIsLoading(true);
      setUnconfirmedEmail(null);

      const result = await signIn("credentials", {
        redirect: false,
        email: data.email,
        password: data.password,
      });

      if (result && !result.ok) {
        setIsLoading(false);
        throw result.error;
      }

      if (router.query.callbackUrl) {
        router.push(router.query.callbackUrl as string);
      } else {
        router.push("/profile");
      }
    } catch (error) {
      setIsLoading(false);
      if (isUnconfirmedError(error)) {
        setResendState("idle");
        setUnconfirmedEmail(data.email);
        return;
      }
      handleRejection(error);
    }
  };

  const onResendConfirmation = async () => {
    if (!unconfirmedEmail) return;
    try {
      setResendState("sending");
      await authService.resendConfirmation(unconfirmedEmail);
      setResendState("sent");
    } catch (error) {
      setResendState("idle");
      handleRejection(error);
    }
  };

  return (
    <>
      {unconfirmedEmail && (
        <Alert variant={"default"} className="mb-4 border-amber-500/50">
          <AlertTitle>Verify your email to continue</AlertTitle>
          <AlertDescription className="text-sm">
            Your account isn&apos;t verified yet. Check{" "}
            <strong>{unconfirmedEmail}</strong> for the verification link.
          </AlertDescription>
          <div className="mt-2 text-sm">
            {resendState === "sent" ? (
              <span className="text-muted-foreground">
                Verification email re-sent.
              </span>
            ) : (
              <button
                type="button"
                onClick={onResendConfirmation}
                disabled={resendState === "sending"}
                className="text-brand font-semibold underline disabled:opacity-60"
              >
                {resendState === "sending"
                  ? "Resending…"
                  : "Resend verification email"}
              </button>
            )}
          </div>
        </Alert>
      )}

      <form
        onSubmit={handleSubmit(onLoginWithCredential)}
        className="space-y-4"
      >
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            {...register("email")}
            type="text"
            id="email"
            placeholder="johndoe@example.com"
            autoComplete="email"
            autoFocus
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
            placeholder="Enter your password"
            autoComplete="current-password"
          />
          {errors.password && (
            <p className="text-xs italic text-red-500 mt-2">
              {errors.password?.message}
            </p>
          )}
        </div>

        <div className="flex justify-end text-sm">
          <Link
            href="/forgot-password"
            className="text-brand font-semibold hover:text-foreground transition-colors"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" className="w-full my-3" disabled={isLoading}>
          {isLoading ? "Please Wait..." : "Login"}
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
      </div> */}

      {/* <GoogleAuthButton></GoogleAuthButton> */}
    </>
  );
}
