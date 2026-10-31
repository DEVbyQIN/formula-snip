# Third-party notices

FormulaSnip bundles the following third-party software into
`FormulaSnip.app/Contents/Resources/web/vendor/`:

## MathJax

- Package: `mathjax` 4.1.3
- Project: https://www.mathjax.org / https://github.com/mathjax/MathJax
- License: Apache License 2.0
- Bundled files: `tex-svg-nofont.js`, `LICENSE`

## MathJax font data packages (4.1.3)

Each of these is published by the MathJax Consortium and declared
Apache-2.0 in its package metadata:

| Package | Font |
|---|---|
| `@mathjax/mathjax-newcm-font` | New Computer Modern |
| `@mathjax/mathjax-modern-font` | Latin Modern |
| `@mathjax/mathjax-stix2-font` | STIX Two |
| `@mathjax/mathjax-pagella-font` | Pagella |
| `@mathjax/mathjax-fira-font` | Fira Math |
| `@mathjax/mathjax-tex-font` | original MathJax TeX font |

Only the SVG font data (`svg.js` and `svg/dynamic/*.js`) is bundled.

## Notes

- MathJax is loaded locally from the app bundle; the app makes no network
  requests for typesetting.
- The Chinese glyphs in `\text{…}` come from macOS system fonts at render
  time and are not redistributed with this app.
- The snippet definitions are adapted from the default snippets of
  [obsidian-latex-suite](https://github.com/artisticat1/obsidian-latex-suite)
  (MIT) and rewritten for this single-formula editor.


## Electron desktop build

The Electron-based desktop build bundles Electron 45 / Chromium / Node.js.
Their license texts ship inside the packaged app (Electron's own `LICENSES.chromium.html`
and `LICENSE`), and Electron is distributed under the MIT license.
