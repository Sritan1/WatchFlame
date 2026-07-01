// Required MapTiler attribution for the Free plan: a visible MapTiler logo that
// links to maptiler.com, shown in the corner of every map. The logo SVG is
// MapTiler's hosted branding asset (no API key, not a tile, so it doesn't count
// toward tile usage). Sizing is responsive via `.maptiler-logo` in globals.css
// so it shrinks on phones. Rendered as an absolute overlay, so its parent must
// be position:relative.
export function MapTilerLogo() {
  return (
    <a
      href="https://www.maptiler.com"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="MapTiler"
      style={{ position: 'absolute', left: 8, bottom: 8, zIndex: 1000, lineHeight: 0 }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="maptiler-logo" src="https://api.maptiler.com/resources/logo.svg" alt="MapTiler" />
    </a>
  );
}
