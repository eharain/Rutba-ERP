import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import LayoutMain from "@/components/layouts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Spinner from "@/components/ui/spinner";
import { BASE_URL } from "@/static/const";

// Customer-facing landing page for the cost-change approval link emailed
// from order-management. The email body links here with ?token=<ack_token>;
// we POST that token to /sale-orders/confirm-change and render the result.
//
// Token-as-auth (no JWT): the route on the server side burns the token after
// the first successful consumption, so a replayed link cannot move the order
// twice. We auto-fire on mount when ?token is present and idempotent enough
// that React 18 StrictMode's double-effect-in-dev doesn't matter — a second
// call returns 410 which we treat as "already confirmed".

type State =
  | { phase: "idle" }
  | { phase: "submitting" }
  | { phase: "ok"; orderId?: string }
  | { phase: "already" }
  | { phase: "error"; message: string };

export default function ConfirmChangePage() {
  const router = useRouter();
  const tokenFromQuery = router.query.token as string | undefined;
  const [state, setState] = useState<State>({ phase: "idle" });

  useEffect(() => {
    if (!router.isReady) return;
    if (!tokenFromQuery) {
      setState({ phase: "error", message: "Missing approval token." });
      return;
    }
    let cancelled = false;
    (async () => {
      setState({ phase: "submitting" });
      try {
        const res = await fetch(`${BASE_URL}/sale-orders/confirm-change`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: tokenFromQuery }),
        });
        const payload = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) {
          setState({ phase: "ok", orderId: payload?.data?.order_id });
        } else if (res.status === 410) {
          // Token already consumed — treat as success-shaped state so a
          // customer who clicks the link twice doesn't think they failed.
          setState({ phase: "already" });
        } else {
          const msg =
            payload?.error?.message ||
            payload?.message ||
            `Confirmation failed (HTTP ${res.status}).`;
          setState({ phase: "error", message: msg });
        }
      } catch (err: any) {
        if (cancelled) return;
        setState({
          phase: "error",
          message: err?.message || "Network error — please try again.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router.isReady, tokenFromQuery]);

  return (
    <LayoutMain>
      <div className="container py-5" style={{ maxWidth: 640 }}>
        <Card>
          <CardHeader>
            <CardTitle>Order Change Approval</CardTitle>
          </CardHeader>
          <CardContent>
            {state.phase === "idle" || state.phase === "submitting" ? (
              <div className="d-flex align-items-center gap-2 text-muted">
                <Spinner />
                <span>Confirming your approval…</span>
              </div>
            ) : null}

            {state.phase === "ok" && (
              <div>
                <div className="alert alert-success">
                  <strong>Thanks — your approval was recorded.</strong>
                  {state.orderId && (
                    <>
                      {" "}Order <code>{state.orderId}</code> will move into
                      packaging shortly.
                    </>
                  )}
                </div>
                <p className="text-muted small mb-3">
                  You'll receive a separate notification when the order is
                  packed and on the way.
                </p>
                <Button onClick={() => router.push("/")}>Continue shopping</Button>
              </div>
            )}

            {state.phase === "already" && (
              <div>
                <div className="alert alert-info">
                  This change has already been confirmed. No further action is
                  needed.
                </div>
                <Button onClick={() => router.push("/")}>Continue shopping</Button>
              </div>
            )}

            {state.phase === "error" && (
              <div>
                <div className="alert alert-danger">
                  <strong>Couldn't confirm:</strong> {state.message}
                </div>
                <p className="text-muted small mb-3">
                  If you're unsure why you got this email, reach out to the store
                  team and they'll sort it out.
                </p>
                <Button variant="outline" onClick={() => router.push("/")}>
                  Back to home
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </LayoutMain>
  );
}
