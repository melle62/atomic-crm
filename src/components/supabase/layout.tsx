import * as React from "react";
import { Notification } from "@/components/admin/notification";
import { AppLogo } from "@/components/atomic-crm/layout/AppLogo";

export const Layout = ({ children }: React.PropsWithChildren) => {
  return (
    <div className="min-h-screen flex">
      <div className="container relative grid flex-col items-center justify-center sm:max-w-none lg:grid-cols-2 lg:px-0">
        <div className="relative hidden h-full flex-col bg-muted p-10 text-white dark:border-r lg:flex">
          <div className="absolute inset-0 bg-zinc-900" />
          <AppLogo
            variant="dark"
            className="relative z-20 text-lg font-medium"
          />
        </div>
        <div className="lg:p-8">
          <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
            {children}
          </div>
        </div>
      </div>
      <Notification />
    </div>
  );
};
