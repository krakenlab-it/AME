import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ImportBaseCopy } from "@/components/admin/import-base-copy";

describe("texto del importador", () => {
  it("explica que una fila vale con cédula o solo con correo o teléfono", () => {
    const html = renderToStaticMarkup(<ImportBaseCopy />);
    expect(html).toContain("solo con un correo o un teléfono");
    expect(html).toContain("/ingresar");
    expect(html).toContain("código dactilar");
    expect(html).not.toContain("lo único obligatorio es el");
  });
});
