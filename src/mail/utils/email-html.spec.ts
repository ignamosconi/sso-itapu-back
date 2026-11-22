import { escapeHtml, html, trusted } from './email-html.js';

describe('email-html', () => {
  describe('escapeHtml', () => {
    it('debería escapar &, <, >, " y \'', () => {
      expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
        '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
      );
    });

    it('no debería tocar texto común con tildes y ñ', () => {
      expect(escapeHtml('Pérez Núñez')).toBe('Pérez Núñez');
    });
  });

  describe('html', () => {
    it('debería escapar los valores interpolados y dejar intacto el HTML de la plantilla', () => {
      const name = '<script>alert(1)</script>';
      expect(html`<p>Hola <strong>${name}</strong></p>`).toBe(
        '<p>Hola <strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong></p>',
      );
    });

    it('debería convertir números a texto', () => {
      expect(html`<p>${5} minutos</p>`).toBe('<p>5 minutos</p>');
    });

    it('debería insertar tal cual solo el HTML marcado con trusted()', () => {
      expect(html`<p>${trusted('<b>ok</b>')} ${'<b>no</b>'}</p>`).toBe('<p><b>ok</b> &lt;b&gt;no&lt;/b&gt;</p>');
    });

    it('debería funcionar sin interpolaciones y con varias seguidas', () => {
      expect(html`<p>fijo</p>`).toBe('<p>fijo</p>');
      expect(html`${'a'}${'<'}${'b'}`).toBe('a&lt;b');
    });

    it('debería escapar el & de un link para que sea un atributo href válido', () => {
      const link = 'http://x/confirm?token=abc&otro=1';
      expect(html`<a href="${link}">${link}</a>`).toBe(
        '<a href="http://x/confirm?token=abc&amp;otro=1">http://x/confirm?token=abc&amp;otro=1</a>',
      );
    });
  });
});