import FormLeadCapture from "@/components/form/lead/form-lead-capture";

export default function CmsContactFormSection({ title }: { title: string }) {
  return (
    <section className="container-fluid my-12">
      <div className="max-w-3xl mx-auto rounded-xl border border-slate-200 bg-white p-6 md:p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h2 className="text-2xl md:text-3xl font-bold">Contact Us</h2>
          <p className="text-slate-600 mt-2">
            Have a question about <span className="font-medium">{title}</span>? Send us a message and our team will get back to you.
          </p>
        </div>
        <FormLeadCapture />
      </div>
    </section>
  );
}
