"use client";

// Tank's own verification landing page.
//
// A separate ROUTE rather than a ?zone=tank query, because GoTrue strips the
// query when it redirects a failed link (…/auth/verify#error=access_denied),
// which is exactly the moment a viewer most needs to still recognise where
// they are. Auth is shared across every zone; the zones are not.
import { AuthVerifyView } from "../page";

export default function TankAuthVerifyPage() {
  return <AuthVerifyView forceTank />;
}
