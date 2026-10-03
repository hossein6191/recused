import { ImageResponse } from "next/og";

import { SITE_NAME } from "@/lib/config";
import { markDataUri } from "@/lib/mark";

export const alt = "Recused: a shared fund that will not let you countersign your own interest";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The card shared links show: the mark, the name, and the one sentence the site is about, on the
// dark plate with GenLayer's gradient behind it.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          backgroundColor: "#0B0E11",
          backgroundImage:
            "radial-gradient(circle at 88% 8%, rgba(227,125,247,0.45), transparent 46%), radial-gradient(circle at 8% 100%, rgba(17,15,255,0.55), transparent 52%), radial-gradient(circle at 60% 120%, rgba(155,106,246,0.4), transparent 50%)",
          color: "#F2F4F6",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <img src={markDataUri()} width={96} height={96} alt="" />
          <div style={{ marginLeft: 24, fontSize: 64, fontWeight: 700, letterSpacing: -2 }}>{SITE_NAME}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 62, fontWeight: 700, lineHeight: 1.1, letterSpacing: -1.5, maxWidth: 1000 }}>
            Two countersignatures, and none from anyone the spend would move.
          </div>
          <div style={{ marginTop: 28, fontSize: 30, color: "#C9CFD6", maxWidth: 980 }}>
            A shared fund on GenLayer. Members file their interests first; the contract reads each countersignature under
            both branches of the decision.
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, color: "#98A2AE" }}>
          <div>GenLayer Studio · chain 61999</div>
          <div>Test network, test GEN only</div>
        </div>
      </div>
    ),
    size,
  );
}
