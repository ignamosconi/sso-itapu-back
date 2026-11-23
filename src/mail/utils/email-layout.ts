// Estructura visual común de los mails de ITAPU (tablas + estilos en línea: es lo que
// soportan Gmail y Outlook). Solo estilo: el contenido de cada mail lo define quien llama.
//
// Convención de seguridad (importante):
//  - Los parámetros llamados `text`, `label`, `title`, `url` son TEXTO PLANO: se escapan acá.
//  - Los parámetros llamados `inner` o `body` (y los valores de keyValueTable / bulletList) son HTML YA
//    ESCAPADO: hay que construirlos siempre con el tag html`...`, nunca con strings crudos.
//  - Los helpers devuelven SafeHtml, así se pueden interpolar dentro de html`...` sin que se
//    escapen dos veces.

import { html, trusted } from './email-html.js';

export type SafeHtml = ReturnType<typeof trusted>;
export type CalloutTone = 'neutral' | 'info' | 'danger';

const C = {
  blue: '#1E3C92',
  red: '#E5322D',
  redPastel: '#F4A09A',
  ink: '#171516',
  white: '#FFFFFF',
  page: '#FEF8F1',
  muted: '#5B5658',
  line: '#E7E0D5',
  blueTint: '#E9EDF8',
  redTint: '#FCEAE9',
  neutralTint: '#F5F1EA',
} as const;

const SANS = 'Segoe UI, Helvetica, Arial, sans-serif';
const SERIF = 'Georgia, Times New Roman, serif';
const MONO = 'Consolas, Menlo, Courier New, monospace';

const TONES: Record<CalloutTone, string> = {
  neutral: C.neutralTint,
  info: C.blueTint,
  danger: C.redTint,
};

/** Documento completo: fondo crema, cabecera, tarjeta blanca con borde negro y pie. */
export function emailLayout(opts: { title: string; body: string }): string {
  const { title, body } = opts;
  return html`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${C.page}" bgcolor="${C.page}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.page}" style="background:${C.page}">
<tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px">

    <tr><td style="padding:0 0 16px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.white}" style="border-collapse:separate;background:${C.white};border:1px solid ${C.ink};border-radius:12px">
        <tr><td style="padding:14px 22px;font-family:${SANS};font-size:15px;font-weight:700;letter-spacing:0.18em;color:${C.blue}">ITAPU<span style="color:${C.red}">&nbsp;&bull;&nbsp;</span><span style="color:${C.ink};font-weight:600">SSO</span></td></tr>
      </table>
    </td></tr>

    <tr><td>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.white}" style="border-collapse:separate;background:${C.white};border:1px solid ${C.ink};border-radius:12px">
        <tr><td style="padding:32px 32px 20px">
          <h1 style="margin:0 0 20px;font-family:${SERIF};font-size:26px;line-height:1.25;font-weight:700;color:${C.ink}">${title}</h1>
          ${trusted(body)}
        </td></tr>
      </table>
    </td></tr>

    <tr><td style="padding:18px 8px 0;font-family:${SANS};font-size:12px;line-height:1.5;color:${C.muted};text-align:center">
      SSO ITAPU · Este correo fue generado automáticamente, no respondas a esta dirección.
    </td></tr>

  </table>
</td></tr>
</table>
</body>
</html>`;
}

/** Párrafo de texto normal. `inner` = HTML ya escapado. */
export function p(inner: string): SafeHtml {
  return trusted(
    `<p style="margin:0 0 16px;font-family:${SANS};font-size:15px;line-height:1.6;color:${C.ink}">${inner}</p>`,
  );
}

/** Texto chico y apagado (aclaraciones). `inner` = HTML ya escapado. */
export function note(inner: string): SafeHtml {
  return trusted(
    `<p style="margin:0 0 16px;font-family:${SANS};font-size:13px;line-height:1.6;color:${C.muted}">${inner}</p>`,
  );
}

/** Subtítulo de sección (tipografía con serif, como los títulos). */
export function sectionTitle(text: string): SafeHtml {
  return trusted(
    html`<h2 style="margin:28px 0 12px;font-family:${SERIF};font-size:19px;line-height:1.3;font-weight:700;color:${C.ink}">${text}</h2>`,
  );
}

/** Etiqueta chica en mayúsculas. */
export function label(text: string): SafeHtml {
  return trusted(
    html`<p style="margin:0 0 6px;font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.blue}">${text}</p>`,
  );
}

/** Botón redondeado. Por defecto rojo pastel de ITAPU y alineado a la izquierda; admite 'center' y 'blue'. */
export function button(
  text: string,
  url: string,
  align: 'left' | 'center' = 'left',
  color: 'red' | 'blue' = 'red',
): SafeHtml {
  const look =
    color === 'blue'
      ? { bg: C.blue, fg: C.white, border: C.blue }
      : { bg: C.redPastel, fg: C.ink, border: C.ink };
  return trusted(
    html`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 14px"><tr><td align="${align}"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="${look.bg}" style="border-collapse:separate;background:${look.bg};border:1px solid ${look.border};border-radius:999px"><a href="${url}" style="display:inline-block;padding:13px 30px;font-family:${SANS};font-size:15px;font-weight:600;line-height:1;color:${look.fg};text-decoration:none;border-radius:999px">${text}</a></td></tr></table></td></tr></table>`,
  );
}

/** El link completo, visible, por si el botón no funciona o el cliente lo bloquea. */
export function linkText(url: string): SafeHtml {
  return trusted(
    html`<p style="margin:0 0 20px;font-family:${SANS};font-size:12px;line-height:1.5;color:${C.muted};word-break:break-all"><a href="${url}" style="color:${C.blue}">${url}</a></p>`,
  );
}

/** Fragmento de código en línea. */
export function code(text: string): SafeHtml {
  return trusted(
    html`<code style="font-family:${MONO};font-size:12px;color:${C.blue};background:${C.blueTint};padding:1px 5px;border-radius:4px">${text}</code>`,
  );
}

/** Panel con fondo suave y borde negro. `inner` = HTML ya escapado. */
export function callout(inner: string, tone: CalloutTone = 'neutral'): SafeHtml {
  const bg = TONES[tone];
  return trusted(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${bg}" style="margin:0 0 16px;border-collapse:separate;background:${bg};border:1px solid ${C.ink};border-radius:10px"><tr><td style="padding:14px 18px;font-family:${SANS};font-size:14px;line-height:1.6;color:${C.ink}">${inner}</td></tr></table>`,
  );
}

/** Lista con viñetas. Cada item = HTML ya escapado. */
export function bulletList(items: string[]): SafeHtml {
  const lis = items.map((li) => `<li style="margin:0 0 4px">${li}</li>`).join('');
  return trusted(
    `<ul style="margin:0;padding-left:18px;font-family:${SANS};font-size:13px;line-height:1.7;color:${C.ink}">${lis}</ul>`,
  );
}

/** Tabla de pares nombre → valor. Cada valor = HTML ya escapado. */
export function keyValueTable(rows: Array<[string, string]>): SafeHtml {
  const trs = rows
    .map(
      ([name, value], i) =>
        html`<tr><td style="padding:10px 12px 10px 0;width:34%;vertical-align:top;font-family:${SANS};font-size:12px;color:${C.muted};${trusted(i < rows.length - 1 ? `border-bottom:1px solid ${C.line};` : '')}">${name}</td>` +
        `<td style="padding:10px 0;vertical-align:top;font-family:${SANS};font-size:13px;color:${C.ink};${i < rows.length - 1 ? `border-bottom:1px solid ${C.line};` : ''}">${value}</td></tr>`,
    )
    .join('');
  return trusted(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px">${trs}</table>`,
  );
}

/** Tarjeta de un paso numerado. `inner` = HTML ya escapado. */
export function stepCard(title: string, inner: string): SafeHtml {
  return trusted(
    html`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px;border-collapse:separate;border:1px solid ${C.line};border-radius:8px"><tr><td style="padding:12px 16px;font-family:${SANS}"><p style="margin:0 0 4px;font-size:13px;font-weight:700;color:${C.ink}">${title}</p><p style="margin:0;font-size:12px;line-height:1.7;color:${C.muted}">${trusted(inner)}</p></td></tr></table>`,
  );
}