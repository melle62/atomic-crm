import { Notification } from "@/components/admin/notification";
import { useTranslate } from "ra-core";
import { AppLogo } from "../layout/AppLogo";

export const ConfirmationRequired = () => {
  const translate = useTranslate();

  return (
    <div className="h-screen p-8">
      <AppLogo
        variant="monochrome"
        className="gap-4"
        titleClassName="text-xl font-semibold"
      />
      <div className="h-full text-center">
        <div className="max-w-sm mx-auto h-full flex flex-col justify-center gap-4">
          <h1 className="text-2xl font-bold mb-4">
            {translate("crm.auth.welcome_title", {
              _: "Welcome to Atomic CRM",
            })}
          </h1>
          <p className="text-base mb-4">
            {translate("crm.auth.confirmation_required", {
              _: "Please follow the link we just sent you by email to confirm your account.",
            })}
          </p>
        </div>
      </div>
      <Notification />
    </div>
  );
};

ConfirmationRequired.path = "/sign-up/confirm";
