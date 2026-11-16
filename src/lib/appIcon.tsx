import { ImageResponse } from "next/og";

/** App icon: a rising line on a dark rounded tile, rendered to PNG at any size. */
export function renderAppIcon(size: number) {
  const s = size / 100;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0b0b0b" }}>
        <svg width={64 * s} height={64 * s} viewBox="0 0 64 64">
          <polyline points="4,48 22,30 34,40 60,12" fill="none" stroke="#3987e5" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="60" cy="12" r="5" fill="#1baf7a" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
