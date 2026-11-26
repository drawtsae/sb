import type { Metadata } from "next";
import { LiveClient } from "./LiveClient";

// Public (excluded from the auth proxy) and prerendered at build time: the service worker
// precaches this HTML, so it must not depend on the request. Everything shown comes from the
// localStorage snapshot, rendered client-side by LiveClient.
export const dynamic = "force-static";

export const metadata: Metadata = { title: "Trực tiếp · Soundboard đám cưới" };

export default function LivePage() {
  return <LiveClient />;
}
