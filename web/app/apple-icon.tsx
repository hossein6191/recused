import { ImageResponse } from "next/og";

import { markDataUri } from "@/lib/mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#0B0E11" }}>
        <img src={markDataUri()} width={140} height={140} alt="" />
      </div>
    ),
    size,
  );
}
