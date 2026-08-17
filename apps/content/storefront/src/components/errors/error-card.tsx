import { AlertCircleIcon, RefreshCwIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";

interface ErrorCardProps {
  // Accepts a plain string, an Error, or an axios-style error object.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  message?: any;
  // Optional inline retry — pass react-query's `refetch` so the Reload link
  // re-runs just this query. Falls back to a full page reload when omitted.
  onRetry?: () => void;
}

// Pull a human-readable string out of whatever was handed in, without ever
// dumping raw JSON at the customer. (The old version took the whole props
// object as `message` and JSON.stringify'd it, which is why shoppers saw
// `{"message":"Request failed with status code 404"}` on the page.)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toDetail(message: any): string {
  if (!message) return "";
  if (typeof message === "string") return message;
  if (typeof message?.message === "string") return message.message;
  return "";
}

export function ErrorCard({ message, onRetry }: ErrorCardProps) {
  const handleReload = () => {
    if (onRetry) {
      onRetry();
    } else if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  const detail = toDetail(message);

  return (
    <Alert variant="default">
      <div className="flex items-start">
        <AlertCircleIcon className="h-5 w-5 shrink-0" />
        <div className="ml-3">
          <AlertTitle>We could not load this right now</AlertTitle>
          <AlertDescription>
            <p className="text-slate-500">
              Something tripped up on our end. Give it another go in a moment.
            </p>
            <button
              type="button"
              onClick={handleReload}
              className="mt-2 inline-flex items-center gap-1.5 font-medium text-brand hover:underline"
            >
              <RefreshCwIcon className="h-4 w-4" />
              Reload
            </button>
            {/* Keep the technical detail for debugging, but never in prod —
                customers should never see status codes or stack noise. */}
            {process.env.NODE_ENV !== "production" && detail ? (
              <p className="mt-1 text-xs text-slate-400">{detail}</p>
            ) : null}
          </AlertDescription>
        </div>
      </div>
    </Alert>
  );
}
