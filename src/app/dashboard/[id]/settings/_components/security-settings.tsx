"use client";

import { useEffect, useState } from "react";
import { ShowcaseSection } from "@/components/Layouts/dashboard/sidebar/showcase-section";
import { createBrowserClient } from "@/utils/supabase/client";

type EnrollState = {
  factorId: string;
  qrCodeSvg: string;
  secret: string;
} | null;

export function SecuritySettingsForm() {
  const [loading, setLoading] = useState(true);
  const [enrolledFactorId, setEnrolledFactorId] = useState<string | null>(null);
  const [enroll, setEnroll] = useState<EnrollState>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshFactors = async () => {
    const supabase = createBrowserClient();
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    const verified = data.totp.find((factor) => factor.status === "verified");
    setEnrolledFactorId(verified?.id ?? null);
    setLoading(false);
  };

  useEffect(() => {
    refreshFactors();
  }, []);

  const startEnroll = async () => {
    setError(null);
    setBusy(true);
    const supabase = createBrowserClient();
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setEnroll({
      factorId: data.id,
      qrCodeSvg: data.totp.qr_code,
      secret: data.totp.secret,
    });
  };

  const cancelEnroll = async () => {
    if (!enroll) return;
    const supabase = createBrowserClient();
    // Enrolled-but-unverified factors otherwise linger and block re-enrolling.
    await supabase.auth.mfa.unenroll({ factorId: enroll.factorId });
    setEnroll(null);
    setCode("");
    setError(null);
  };

  const confirmEnroll = async () => {
    if (!enroll || code.length !== 6) return;
    setError(null);
    setBusy(true);
    const supabase = createBrowserClient();
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: enroll.factorId,
    });
    if (challengeError) {
      setBusy(false);
      setError(challengeError.message);
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: enroll.factorId,
      challengeId: challenge.id,
      code,
    });
    setBusy(false);
    if (verifyError) {
      setError(verifyError.message);
      return;
    }
    setEnroll(null);
    setCode("");
    await refreshFactors();
  };

  const disable = async () => {
    if (!enrolledFactorId) return;
    setError(null);
    setBusy(true);
    const supabase = createBrowserClient();
    const { error } = await supabase.auth.mfa.unenroll({ factorId: enrolledFactorId });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    await refreshFactors();
  };

  return (
    <ShowcaseSection title="Two-Factor Authentication" className="!p-7">
      {loading ? (
        <p className="text-sm text-dark-6 dark:text-dark-6">Checking your account…</p>
      ) : error ? (
        <p className="mb-3 text-sm text-red">{error}</p>
      ) : null}

      {!loading && enrolledFactorId && !enroll && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-dark dark:text-white">
            Two-factor authentication is <span className="font-medium text-green">enabled</span>.
            Signing in now requires a code from your authenticator app.
          </p>
          <div>
            <button
              type="button"
              disabled={busy}
              onClick={disable}
              className="rounded-lg border border-stroke px-6 py-[7px] font-medium text-dark hover:shadow-1 disabled:opacity-50 dark:border-dark-3 dark:text-white"
            >
              Disable two-factor authentication
            </button>
          </div>
        </div>
      )}

      {!loading && !enrolledFactorId && !enroll && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-dark-6 dark:text-dark-6">
            Add an authenticator app (Google Authenticator, 1Password, etc.) as a second sign-in
            step.
          </p>
          <div>
            <button
              type="button"
              disabled={busy}
              onClick={startEnroll}
              className="rounded-lg bg-primary px-6 py-[7px] font-medium text-gray-2 hover:bg-opacity-90 disabled:opacity-50"
            >
              Enable two-factor authentication
            </button>
          </div>
        </div>
      )}

      {enroll && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-dark-6 dark:text-dark-6">
            Scan this code with your authenticator app, or enter the key manually.
          </p>
          <div
            className="w-fit rounded-lg border border-stroke bg-white p-3"
            dangerouslySetInnerHTML={{ __html: enroll.qrCodeSvg }}
          />
          <p className="break-all font-mono text-xs text-dark-6 dark:text-dark-6">
            {enroll.secret}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full max-w-[160px] rounded-lg border border-stroke bg-transparent px-4 py-2 text-dark outline-none focus:border-primary dark:border-dark-3 dark:text-white"
            />
            <button
              type="button"
              disabled={busy || code.length !== 6}
              onClick={confirmEnroll}
              className="rounded-lg bg-primary px-6 py-[7px] font-medium text-gray-2 hover:bg-opacity-90 disabled:opacity-50"
            >
              Verify and enable
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={cancelEnroll}
              className="rounded-lg border border-stroke px-6 py-[7px] font-medium text-dark hover:shadow-1 disabled:opacity-50 dark:border-dark-3 dark:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </ShowcaseSection>
  );
}
