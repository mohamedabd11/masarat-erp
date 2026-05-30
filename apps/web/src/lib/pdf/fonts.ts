import { Font } from '@react-pdf/renderer';

let registered = false;

export function registerArabicFonts(): void {
  if (registered) return;
  registered = true;

  // Cairo Arabic — covers all Arabic Unicode ranges, clean modern typeface
  Font.register({
    family: 'Cairo',
    fonts: [
      {
        src: 'https://cdn.jsdelivr.net/npm/@fontsource/cairo@5.1.1/files/cairo-arabic-400-normal.woff',
        fontWeight: 400,
      },
      {
        src: 'https://cdn.jsdelivr.net/npm/@fontsource/cairo@5.1.1/files/cairo-arabic-700-normal.woff',
        fontWeight: 700,
      },
    ],
  });

  // Hyphenation disabled — Arabic doesn't hyphenate
  Font.registerHyphenationCallback(word => [word]);
}
