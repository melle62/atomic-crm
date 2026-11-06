import { memoryStore, StoreContextProvider } from "ra-core";
import { render } from "vitest-browser-react";

import {
  CONFIGURATION_STORE_KEY,
  type LogoStyle,
} from "../root/ConfigurationContext";
import { defaultConfiguration } from "../root/defaultConfiguration";
import { AppLogo, type AppLogoProps } from "./AppLogo";

const LIGHT_LOGO = "https://example.com/light.svg";
const DARK_LOGO = "https://example.com/dark.svg";

const renderLogo = (logoStyle: LogoStyle, props: AppLogoProps = {}) =>
  render(
    <StoreContextProvider
      value={memoryStore({
        [CONFIGURATION_STORE_KEY]: {
          ...defaultConfiguration,
          title: "Brifex",
          lightModeLogo: LIGHT_LOGO,
          darkModeLogo: DARK_LOGO,
          logoStyle,
        },
      })}
    >
      <AppLogo {...props} />
    </StoreContextProvider>,
  );

const logoSources = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("img")).map((img) =>
    img.getAttribute("src"),
  );

describe("AppLogo", () => {
  it("shows the title next to the logo in icon style", async () => {
    const screen = await renderLogo("icon");

    await expect.element(screen.getByText("Brifex")).toBeInTheDocument();
    expect(logoSources(screen.container)).toEqual([DARK_LOGO, LIGHT_LOGO]);
  });

  it("hides the title in horizontal style but keeps it as alt text", async () => {
    const screen = await renderLogo("horizontal");

    expect(screen.container.textContent).toBe("");
    expect(
      Array.from(screen.container.querySelectorAll("img")).every(
        (img) => img.alt === "Brifex",
      ),
    ).toBe(true);
  });

  it("renders a larger, width-capped image in horizontal style", async () => {
    const screen = await renderLogo("horizontal");

    const image = screen.container.querySelector("img");
    expect(image?.className).toContain("h-8");
    expect(image?.className).toContain("max-w-[200px]");
  });

  it("uses only the dark-mode logo on dark panels", async () => {
    const screen = await renderLogo("horizontal", { variant: "dark" });

    expect(logoSources(screen.container)).toEqual([DARK_LOGO]);
  });

  it("flattens the logo to one colour in monochrome variant", async () => {
    const screen = await renderLogo("icon", { variant: "monochrome" });

    const image = screen.container.querySelector("img");
    expect(image?.className).toContain("brightness-0");
  });
});
