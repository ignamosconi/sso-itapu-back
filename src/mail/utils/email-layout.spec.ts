import { html } from './email-html.js';
import {
  bulletList,
  button,
  callout,
  code,
  emailLayout,
  keyValueTable,
  linkText,
  p,
  stepCard,
} from './email-layout.js';

describe('email-layout', () => {
  describe('emailLayout', () => {
    it('debería generar un documento completo con el título y el cuerpo', () => {
      const out = emailLayout({ title: 'Bienvenido/a a ITAPU', body: html`<p>cuerpo</p>` });
      expect(out).toContain('<!DOCTYPE html>');
      expect(out).toContain('<h1');
      expect(out).toContain('Bienvenido/a a ITAPU');
      expect(out).toContain('<p>cuerpo</p>');
      expect(out).toContain('SSO ITAPU');
    });

    it('debería escapar el título', () => {
      const out = emailLayout({ title: '<script>x</script>', body: '' });
      expect(out).not.toContain('<script>');
      expect(out).toContain('&lt;script&gt;x&lt;/script&gt;');
    });

    it('no debería escapar dos veces el cuerpo ya escapado', () => {
      const out = emailLayout({ title: 't', body: html`<p>${'<b>Ana</b>'}</p>` });
      expect(out).toContain('&lt;b&gt;Ana&lt;/b&gt;');
      expect(out).not.toContain('&amp;lt;');
    });

    it('debería usar los colores de ITAPU', () => {
      const out = emailLayout({ title: 't', body: '' });
      expect(out).toContain('#1E3C92');
      expect(out).toContain('#E5322D');
      expect(out).toContain('#171516');
    });
  });

  describe('button / linkText', () => {
    it('debería escapar el & de la URL y el texto del botón', () => {
      const out = button('<Ir>', 'http://x/a?t=1&u=2').value;
      expect(out).toContain('href="http://x/a?t=1&amp;u=2"');
      expect(out).toContain('&lt;Ir&gt;');
    });

    it('linkText debería mostrar la URL escapada como link', () => {
      const out = linkText('http://x/a?t=1&u=2').value;
      expect(out).toContain('href="http://x/a?t=1&amp;u=2"');
      expect(out).toContain('>http://x/a?t=1&amp;u=2</a>');
    });

    it('debería neutralizar comillas que intenten salir del atributo href', () => {
      const out = button('ok', 'http://x" onclick="alert(1)').value;
      expect(out).not.toContain('" onclick="');
      expect(out).toContain('&quot;');
    });
  });

  describe('p / callout / bulletList / stepCard', () => {
    it('p debería insertar tal cual el HTML ya escapado', () => {
      expect(p(html`Hola <strong>${'<i>'}</strong>`).value).toContain('Hola <strong>&lt;i&gt;</strong>');
    });

    it('callout debería usar el fondo según el tono', () => {
      expect(callout('x', 'info').value).toContain('#E9EDF8');
      expect(callout('x', 'danger').value).toContain('#FCEAE9');
      expect(callout('x').value).toContain('#F5F1EA');
    });

    it('bulletList debería generar un <li> por item', () => {
      const out = bulletList(['uno', 'dos']).value;
      expect(out.match(/<li /g)).toHaveLength(2);
    });

    it('stepCard no debería escapar dos veces el cuerpo', () => {
      const out = stepCard('1. Paso', html`${code('a&b')}`).value;
      expect(out).toContain('a&amp;b');
      expect(out).not.toContain('&amp;amp;');
    });
  });

  describe('keyValueTable / code', () => {
    it('debería generar una fila por par y escapar el nombre', () => {
      const out = keyValueTable([
        ['<Nombre>', 'valor'],
        ['Otro', html`<strong>${'x&y'}</strong>`],
      ]).value;
      expect(out.match(/<tr>/g)).toHaveLength(2);
      expect(out).toContain('&lt;Nombre&gt;');
      expect(out).toContain('<strong>x&amp;y</strong>');
    });

    it('code debería escapar su contenido', () => {
      expect(code('<b>').value).toContain('&lt;b&gt;');
    });
  });
});