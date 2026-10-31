import { NextResponse } from "next/server";

// Serves /ads.txt for Google AdSense account verification.
// Env-gated on purpose: without NEXT_PUBLIC_ADSENSE_PUBLISHER_ID
// there is no publisher to declare, so this returns 404 rather than
// a wrong or placeholder file (a wrong pub ID would misattribute the
// site and can break AdSense approval).
export function GET() {
  const publisher = process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID;
  if (!publisher) {
    return new NextResponse("AdSense not configured.", { status: 404 });
  }
  // ads.txt uses the bare pub- form; the AdSense script tag uses the
  // ca-pub- form. The env var stores the ca-pub- form (as shown in
  // the AdSense dashboard), so strip the ca- prefix here only.
  const adsTxtId = publisher.replace(/^ca-/, "");
  return new NextResponse(`google.com, ${adsTxtId}, DIRECT, f08c47fec0942fa\n`, {
    headers: { "content-type": "text/plain" },
  });
}
