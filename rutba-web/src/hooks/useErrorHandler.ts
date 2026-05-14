import { useToast } from "@/components/ui/use-toast";

export default function useErrorHandler() {
  const { toast } = useToast();

  const showError = (error: string) => {
    return toast({
      duration: 3000,
      variant: "destructive",
      title: "Error",
      description: error,
    });
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleRejection = (error: any) => {
    console.error("error_from_code: " + error);

    if (typeof error === "string") {
      showError(error);
    } else if (error.response) {
      showError(error.response?.data?.message ?? error.message ?? "Something went wrong.");
    } else {
      if (error.message) {
        showError(error.message);
      } else {
        showError("Something tripped up on our end — give it another go in a moment, or WhatsApp us if it persists. We're on it.");
      }
    }
  };

  return {
    showError,
    handleRejection,
  };
}
