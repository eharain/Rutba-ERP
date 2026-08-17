import FormShippingInformation from "@/components/form/profile/form-shipping-information";
import ProfileLayout from "@/components/layouts/profile-layout";
import Seo from "@/components/seo/seo";

export default function ProfileAddressPage() {
  return (
    <ProfileLayout>
      <>
        <Seo title="Saved address" noindex />
        <div className="max-w-2xl">
          <FormShippingInformation />
        </div>
      </>
    </ProfileLayout>
  );
}
