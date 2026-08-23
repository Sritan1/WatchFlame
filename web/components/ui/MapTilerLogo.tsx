// The MapTiler attribution their free plan requires, in the corner of every map.
// The SVG is their hosted branding asset, so it needs no key and doesn't count
// toward tile usage. An absolute overlay, so the parent must be position:relative.
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
