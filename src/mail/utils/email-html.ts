// Plantillas de mail seguras por defecto: toda interpolación se escapa.
// Solo se inserta HTML tal cual si se lo marca explícitamente con trusted().
//
// Uso:
//   html`<p>Hola <strong>${student.first_name}</strong></p>`
//
// Sin esto, un nombre como "<img src=x onerror=...>" o un link con caracteres especiales
// se inyectaría en el cuerpo del mail.

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

class TrustedHtml {
  constructor(readonly value: string) {}
}

/** Marca un fragmento como HTML ya seguro (generado por el propio código, nunca por un usuario). */
export function trusted(value: string): TrustedHtml {
  return new TrustedHtml(value);
}

export function html(strings: TemplateStringsArray, ...values: Array<string | number | TrustedHtml>): string {
  let out = strings[0];
  values.forEach((value, i) => {
    out += (value instanceof TrustedHtml ? value.value : escapeHtml(String(value))) + strings[i + 1];
  });
  return out;
}