import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { createLead } from "@/services/leads";
import useErrorHandler from "@/hooks/useErrorHandler";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const SOURCES = ["Website", "Referral", "Social Media", "Other"];

export default function FormLeadCapture() {
  const { handleRejection } = useErrorHandler();
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [notes, setNotes] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    setIsLoading(true);
    try {
      await createLead({
        name,
        email: email || undefined,
        phone: phone || undefined,
        company: company || undefined,
        source: "Website",
        notes: notes || undefined,
      });
      setSubmitted(true);
      setName("");
      setEmail("");
      setPhone("");
      setCompany("");
      setNotes("");
    } catch (error) {
      handleRejection(error);
    } finally {
      setIsLoading(false);
    }
  };

  if (submitted) {
    return (
      <Alert variant="default" className="bg-green-600 text-white">
        <AlertTitle>Thank you!</AlertTitle>
        <AlertDescription>
          Your enquiry has been submitted. We will get back to you shortly.
        </AlertDescription>
        <Button
          variant="outline"
          className="mt-3 text-black"
          onClick={() => setSubmitted(false)}
        >
          Submit another enquiry
        </Button>
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="lead-name">Name *</Label>
        <Input
          id="lead-name"
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div>
        <Label htmlFor="lead-email">Email</Label>
        <Input
          id="lead-email"
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="lead-phone">Phone</Label>
        <Input
          id="lead-phone"
          type="tel"
          placeholder="Your phone number"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="lead-company">Company</Label>
        <Input
          id="lead-company"
          type="text"
          placeholder="Company name (optional)"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="lead-notes">Message</Label>
        <textarea
          id="lead-notes"
          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          placeholder="Tell us about your interest…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <Button type="submit" className="w-full" disabled={isLoading || !name}>
        {isLoading ? "Submitting…" : "Get in Touch"}
      </Button>
    </form>
  );
}
