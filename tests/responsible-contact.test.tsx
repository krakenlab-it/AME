import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PrivacyPage from "@/app/privacidad/page";
import { PortalFooter } from "@/components/portal/shell";
import { RESPONSIBLE_CONTACT } from "@/lib/content/responsible-contact";

const RUC = "1791758528001";
const PHONE = "02-550660";
const EMAIL = "Francisco.arizaga@bacniif.com";

function expectContact(html: string) {
  expect(html).toContain(RUC);
  expect(html).toContain(PHONE);
  expect(html).toContain(EMAIL);
  expect(html).toContain(`href="${RESPONSIBLE_CONTACT.phoneHref}"`);
  expect(html).toContain(`href="mailto:${EMAIL}"`);
}

describe("contacto del responsable", () => {
  afterEach(() => {
    delete process.env.DEMO_MODE;
    delete process.env.APP_STAGE;
  });

  it("el pie muestra el RUC, el teléfono y el correo", () => {
    expectContact(renderToStaticMarkup(createElement(PortalFooter)));
  });

  it("la página de privacidad muestra el bloque y el pie", async () => {
    process.env.DEMO_MODE = "true";
    process.env.APP_STAGE = "development";
    const html = renderToStaticMarkup(await PrivacyPage());
    expect(html).toContain("Contacto del responsable del tratamiento");
    expectContact(html);
  });
});
