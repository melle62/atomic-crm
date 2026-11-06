import { cn } from "@/lib/utils";

import { useConfigurationContext } from "../root/ConfigurationContext";

export type AppLogoProps = {
  /**
   * - "auto": light-mode logo in light theme, dark-mode logo in dark theme
   * - "dark": always the dark-mode logo (for dark panels, e.g. the login page)
   * - "monochrome": the dark-mode logo flattened to the text colour
   */
  variant?: "auto" | "dark" | "monochrome";
  className?: string;
  titleClassName?: string;
};

const ICON_CLASSES = "h-6 w-auto";
// Wide logos get more height, but are capped so they can't push the navigation off-screen.
const HORIZONTAL_CLASSES = "h-8 w-auto max-w-[200px] object-contain";
const MONOCHROME_CLASSES = "filter brightness-0 dark:invert";

/**
 * The app logo, honouring the configured logo style. In "horizontal" style the
 * logo already carries the brand name, so the title is not repeated next to it
 * (it stays available to screen readers through the image alt text).
 */
export const AppLogo = ({
  variant = "auto",
  className,
  titleClassName,
}: AppLogoProps) => {
  const { darkModeLogo, lightModeLogo, logoStyle, title } =
    useConfigurationContext();
  const isHorizontal = logoStyle === "horizontal";
  const imageClasses = cn(
    isHorizontal ? HORIZONTAL_CLASSES : ICON_CLASSES,
    variant === "monochrome" && MONOCHROME_CLASSES,
  );

  return (
    <span className={cn("flex items-center gap-2", className)}>
      {variant === "auto" ? (
        <>
          <img
            className={cn(imageClasses, "[.light_&]:hidden")}
            src={darkModeLogo}
            alt={title}
          />
          <img
            className={cn(imageClasses, "[.dark_&]:hidden")}
            src={lightModeLogo}
            alt={title}
          />
        </>
      ) : (
        <img className={imageClasses} src={darkModeLogo} alt={title} />
      )}
      {!isHorizontal && <span className={titleClassName}>{title}</span>}
    </span>
  );
};
