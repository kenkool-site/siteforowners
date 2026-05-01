import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt =
  "SiteForOwners product preview with rendered booking and dashboard screens";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
        background:
          "radial-gradient(circle at 15% 20%, rgba(236,72,153,0.42), transparent 30%), radial-gradient(circle at 84% 18%, rgba(251,191,36,0.22), transparent 28%), linear-gradient(135deg, #0f172a 0%, #1f1020 48%, #db2777 100%)",
        color: "#fff8ee",
        display: "flex",
        height: "100%",
        overflow: "hidden",
        padding: 64,
        position: "relative",
        width: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: 510,
          zIndex: 2,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div
            style={{
              alignItems: "center",
              background: "rgba(255,248,238,0.12)",
              border: "1px solid rgba(255,248,238,0.24)",
              borderRadius: 999,
              display: "flex",
              fontSize: 25,
              fontWeight: 800,
              padding: "12px 22px",
              width: 226,
            }}
          >
            Site<span style={{ color: "#f9a8d4" }}>ForOwners</span>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 70,
              fontWeight: 950,
              letterSpacing: "-0.07em",
              lineHeight: 0.92,
            }}
          >
            <span>Get booked</span>
            <span>without the</span>
            <span>back-and-forth.</span>
          </div>
          <div
            style={{
              color: "rgba(255,248,238,0.84)",
              fontSize: 28,
              lineHeight: 1.25,
            }}
          >
            Websites, booking, and owner dashboards for local service businesses.
          </div>
        </div>
        <div
          style={{
            alignItems: "center",
            display: "flex",
            fontSize: 22,
            fontWeight: 800,
            gap: 14,
          }}
        >
          <span
            style={{
              background: "#fff8ee",
              borderRadius: 999,
              color: "#111827",
              padding: "14px 24px",
            }}
          >
            Free preview
          </span>
          <span style={{ color: "rgba(255,248,238,0.72)" }}>
            siteforowners.com
          </span>
        </div>
      </div>

      <div
        style={{
          bottom: 56,
          display: "flex",
          height: 448,
          position: "absolute",
          right: 58,
          width: 570,
        }}
      >
        <DashboardCard />
        <PhoneCard />
      </div>
      </div>
    ),
    size,
  );
}

function DashboardCard() {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "10px solid #0f172a",
        borderRadius: 34,
        boxShadow: "0 36px 90px rgba(0,0,0,0.36)",
        display: "flex",
        flexDirection: "column",
        height: 338,
        left: 0,
        overflow: "hidden",
        position: "absolute",
        top: 72,
        transform: "rotate(-4deg)",
        width: 424,
      }}
    >
      <div
        style={{
          alignItems: "center",
          background: "#0f172a",
          display: "flex",
          gap: 8,
          height: 38,
          padding: "0 18px",
        }}
      >
        {["#f9a8d4", "#fbbf24", "#34d399"].map((color) => (
          <span
            key={color}
            style={{ background: color, borderRadius: 999, height: 9, width: 9 }}
          />
        ))}
      </div>
      <div style={{ display: "flex", gap: 16, padding: 22 }}>
        <div
          style={{
            background: "#0f172a",
            borderRadius: 24,
            color: "white",
            display: "flex",
            flexDirection: "column",
            height: 210,
            justifyContent: "space-between",
            padding: 20,
            width: 158,
          }}
        >
          <span style={{ color: "rgba(255,255,255,0.52)", fontSize: 15, fontWeight: 800 }}>
            VISITS
          </span>
          <span style={{ color: "#db2777", fontSize: 66, fontWeight: 950 }}>115</span>
          <div style={{ alignItems: "flex-end", display: "flex", gap: 6, height: 52 }}>
            {[60, 84, 38, 92, 68].map((height) => (
              <span
                key={height}
                style={{
                  background: "#db2777",
                  borderRadius: "8px 8px 0 0",
                  height,
                  width: 17,
                }}
              />
            ))}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, width: 188 }}>
          <Metric label="Bookings today" value="3" />
          <Metric label="New leads" value="5" />
          <Metric label="Paid orders" value="1" />
        </div>
      </div>
    </div>
  );
}

function PhoneCard() {
  return (
    <div
      style={{
        background: "#fff7fb",
        border: "10px solid #111827",
        borderRadius: 42,
        boxShadow: "0 36px 90px rgba(0,0,0,0.42)",
        display: "flex",
        flexDirection: "column",
        height: 410,
        overflow: "hidden",
        position: "absolute",
        right: 24,
        top: 0,
        transform: "rotate(5deg)",
        width: 212,
      }}
    >
      <div style={{ background: "#db2777", height: 110 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 20 }}>
        <div style={{ background: "#111827", borderRadius: 999, height: 18, width: 132 }} />
        <div style={{ background: "#e5e7eb", borderRadius: 999, height: 12, width: 160 }} />
        <div
          style={{
            background: "#fce7f3",
            borderRadius: 22,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            padding: 16,
          }}
        >
          <div style={{ background: "#db2777", borderRadius: 999, height: 12, width: 86 }} />
          <div style={{ background: "#ffffff", borderRadius: 14, height: 52 }} />
          <div
            style={{
              background: "#db2777",
              borderRadius: 999,
              color: "white",
              fontSize: 17,
              fontWeight: 900,
              padding: "12px 0",
              textAlign: "center",
            }}
          >
            Book now
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: 20,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: 18,
      }}
    >
      <span style={{ color: "#db2777", fontSize: 34, fontWeight: 950 }}>{value}</span>
      <span style={{ color: "#475569", fontSize: 16, fontWeight: 700 }}>{label}</span>
    </div>
  );
}
