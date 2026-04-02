import FormLeadCapture from "@/components/form/lead/form-lead-capture";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/router";

export default function ContactPage() {
  const router = useRouter();

  return (
    <div className="flex">
      <div className="container relative my-20 md:my-0 min-h-[100vh] flex-col items-center justify-center md:grid lg:max-w-none lg:grid-cols-2 lg:px-0">
        <div className="relative hidden h-full flex-col bg-muted text-white dark:border-r lg:flex items-center justify-center">
          <div className="p-12 text-center">
            <h2 className="text-3xl font-bold text-gray-800 mb-4">
              Get in Touch
            </h2>
            <p className="text-gray-600 text-lg">
              Have questions about our products or services? Fill out the form
              and our team will reach out to you shortly.
            </p>
          </div>
        </div>
        <div className="lg:p-8">
          <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[400px]">
            <div className="flex flex-col space-y-2 text-center">
              <h1 className="text-2xl font-semibold tracking-tight">
                Contact Us
              </h1>
              <p className="text-sm text-muted-foreground">
                Fill in your details and we&apos;ll get back to you
              </p>
            </div>
            <Button variant="outline" onClick={() => router.push("/")}>
              Back to Home
            </Button>
            <FormLeadCapture />
          </div>
        </div>
      </div>
    </div>
  );
}

