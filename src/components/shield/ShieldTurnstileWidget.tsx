"use client";

import React, { useState, useEffect, useCallback } from "react";
import { ShieldCheck, Check, AlertCircle } from "lucide-react";
import { sha256Hex } from "@/lib/shield/sha256";

export interface ShieldTurnstileProps {
  autoVerify?: boolean;
  onSuccess?: (token: string, rayId: string) => void;
  className?: string;
  inputName?: string;
}

type WidgetStatus = "idle" | "verifying" | "success" | "error";

export default function ShieldTurnstileWidget({
  autoVerify = false,
  onSuccess,
  className = "",
  inputName = "cf-turnstile-response",
}: ShieldTurnstileProps) {
  const [status, setStatus] = useState<WidgetStatus>("idle");
  const [token, setToken] = useState<string>("");
  const [rayId, setRayId] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const solveProofOfWork = useCallback(
    async (challengeData: string, targetPrefix: string): Promise<number> => {
      // Real fix, not the difficulty-cut-and-hope-nobody-notices version
      // shipped 2026-09-04: crypto.subtle.digest() is async, and even
      // batched via Promise.all its per-call dispatch overhead dominates
      // over the hash work itself at real attempt counts (difficulty 4
      // averages 65,536 attempts) — that's what made labs' forced
      // challenge hang past 5s and got the whole trigger pulled instead of
      // fixed. sha256Hex (src/lib/shield/sha256.ts) is a synchronous,
      // allocation-light implementation with none of that per-call async
      // cost — benchmarked at ~450k hashes/sec on this dev machine's V8,
      // which puts difficulty 4 at well under a second even assuming
      // mobile JSCore runs several times slower. Chunked with a yield
      // every CHUNK attempts so the tab still paints/responds instead of
      // hanging the event loop for the whole solve.
      const CHUNK = 20_000;
      let solution = 0;
      while (true) {
        const chunkEnd = solution + CHUNK;
        for (; solution < chunkEnd; solution++) {
          const hash = sha256Hex(`${challengeData}:${solution}`);
          if (hash.startsWith(targetPrefix)) return solution;
        }
        // Yield to the event loop between chunks — keeps the status label
        // and spinner animating instead of freezing the tab.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    },
    []
  );

  const startVerification = useCallback(async () => {
    if (status === "verifying" || status === "success") return;
    setStatus("verifying");
    setErrorMessage("");

    try {
      const challengeRes = await fetch("/api/shield/challenge", {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      if (!challengeRes.ok) {
        throw new Error("Failed to initialize security challenge");
      }

      const { challenge, serialized } = await challengeRes.json();
      const { domain, clientIp, timestamp, nonce, difficulty, rayId } = challenge;
      const challengeData = `${domain}|${clientIp}|${timestamp}|${nonce}|${difficulty}|${rayId}`;
      const targetPrefix = "0".repeat(difficulty);

      const solution = await solveProofOfWork(challengeData, targetPrefix);

      const verifyRes = await fetch("/api/shield/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeStr: serialized,
          solution,
          rayId,
        }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.success) {
        throw new Error(verifyData.error || "Proof of work verification failed");
      }

      setStatus("success");
      setRayId(rayId);
      setToken(serialized);
      onSuccess?.(serialized, rayId);
    } catch (err: any) {
      console.error("[ShieldTurnstile] Verification error:", err);
      setStatus("error");
      setErrorMessage(err.message || "Verification failed");
    }
  }, [status, solveProofOfWork, onSuccess]);

  useEffect(() => {
    if (autoVerify && status === "idle") {
      startVerification();
    }
  }, [autoVerify, status, startVerification]);

  return (
    <div
      className={`relative inline-flex flex-col select-none ${className}`}
      role="region"
      aria-label="Human verification widget"
    >
      <div className="flex items-center justify-between gap-4 p-3 px-3.5 bg-[#0e1015] border border-[#2a2d37] hover:border-[#3b404e] transition-colors rounded-lg shadow-sm min-w-[300px] max-w-[340px]">
        <div
          onClick={status === "idle" || status === "error" ? startVerification : undefined}
          className={`flex items-center gap-3 cursor-pointer ${
            status === "verifying" ? "cursor-wait" : status === "success" ? "cursor-default" : ""
          }`}
        >
          <div className="relative flex items-center justify-center w-7 h-7">
            {status === "idle" && (
              <div className="w-6 h-6 rounded border-2 border-[#555a6d] hover:border-[#ff6600] transition-colors bg-[#16181f]" />
            )}
            {status === "verifying" && (
              <div className="w-6 h-6 border-2 border-orange-500/20 border-t-orange-500 rounded-full animate-spin" />
            )}
            {status === "success" && (
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500 flex items-center justify-center text-emerald-400">
                <Check size={15} strokeWidth={3} />
              </div>
            )}
            {status === "error" && (
              <div className="w-6 h-6 rounded border-2 border-rose-500 bg-rose-500/10 flex items-center justify-center text-rose-400">
                <AlertCircle size={15} />
              </div>
            )}
          </div>
          <div className="flex flex-col text-left">
            <span className="text-xs font-medium text-gray-200">
              {status === "idle" && "Verify you are human"}
              {status === "verifying" && "Verifying…"}
              {status === "success" && "Success"}
              {status === "error" && "Retry verification"}
            </span>
            {rayId && status === "success" && (
              <span className="text-[10px] text-gray-500 font-mono">Ray ID: {rayId}</span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end text-right pl-2 border-l border-[#222530]">
          <div className="flex items-center gap-1 text-[10px] font-bold tracking-wider text-[#ff6600] uppercase">
            <ShieldCheck size={13} className="text-[#ff6600]" />
            <span>UNENTER</span>
          </div>
          <div className="flex items-center gap-1 text-[9px] text-gray-500 mt-0.5">
            <span className="hover:underline cursor-pointer">Privacy</span>
            <span>•</span>
            <span className="hover:underline cursor-pointer">Terms</span>
          </div>
        </div>
      </div>
      <input type="hidden" name={inputName} value={token} />
      <input type="hidden" name="__unt_turnstile_status" value={status} />
      {status === "error" && errorMessage && (
        <p className="text-[11px] text-rose-400 mt-1.5 pl-1">{errorMessage}</p>
      )}
    </div>
  );
}
