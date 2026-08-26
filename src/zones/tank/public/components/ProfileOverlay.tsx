"use client";

import React, { useState, useEffect } from "react";
import {
  User,
  Lock,
  CreditCard,
  X,
  Save,
  Check,
  Sparkles,
  ExternalLink,
  ChevronLeft,
} from "lucide-react";
import { ChromePanel } from "./ChromePanel";
import { ConsoleButton } from "./ConsoleButton";
import { ACTIVE_THEME } from "../../theme";
import { updateTankProfile } from "../../server/actions";
import { createClient } from "@/utils/supabase/client";
import type { TankPlayerProfile } from "../../server/gamification";

const NAME_COLORS = [
  { label: "Red", value: "#ff3b2f" },
  { label: "Orange", value: "#ff7a00" },
  { label: "Amber", value: "#ffb020" },
  { label: "Green", value: "#39ff6a" },
  { label: "Cyan", value: "#4fd6ff" },
  { label: "Purple", value: "#c084fc" },
  { label: "White", value: "#ffffff" },
  { label: "Gold", value: "#facc15" },
];

export const PRESET_AVATARS = [
  "default.png",
  "josie.png",
  "josie-anime.png",
  "jon.png",
  "vance.png",
  "goldstriker.png",
  "goldstriker-gold.png",
  "hassle.png",
  "tj.png",
  "shinji.png",
  "trisha.png",
  "cole.png",
  "jimmy.png",
  "fatty.png",
  "chris.png",
  "damiel.png",
  "sylvia.png",
  "simon.png",
  "lance.png",
  "xavier-gold.png",
  "megan.png",
  "simon-anime.png",
  "chris-anime.png",
  "damiel-anime.png",
  "fatty-anime.png",
  "goldstriker-anime.png",
  "hassle-anime.png",
  "jimmy-anime.png",
  "jon-anime.png",
  "lance-anime.png",
  "megan-anime.png",
  "sylvia-anime.png",
  "tj-anime.png",
  "trisha-anime.png",
  "vance-anime.png",
  "xavier-anime.png",
];

export type ProfileOverlayProps = {
  initialProfile?: TankPlayerProfile | null;
  onClose: () => void;
  onOpenSeasonPass?: () => void;
  onProfileUpdated?: (updated: Partial<TankPlayerProfile>) => void;
};

export function ProfileOverlay({
  initialProfile,
  onClose,
  onOpenSeasonPass,
  onProfileUpdated,
}: ProfileOverlayProps) {
  const [activeTab, setActiveTab] = useState<"profile" | "account" | "billing">("profile");
  const [displayName, setDisplayName] = useState(initialProfile?.displayName ?? "Unenter");
  const [bio, setBio] = useState(initialProfile?.bio ?? "");
  const [selectedColor, setSelectedColor] = useState(initialProfile?.nameColor ?? "#ff3b2f");
  const [avatarUrl, setAvatarUrl] = useState(
    initialProfile?.avatarUrl ||
      "https://db.unenter.live/storage/v1/object/public/tank-avatars/default.png"
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [profileSetupComplete, setProfileSetupComplete] = useState(
    initialProfile?.profileSetupComplete ?? false,
  );
  const [freeRenameAvailable, setFreeRenameAvailable] = useState(
    initialProfile?.freeRenameAvailable ?? true,
  );
  const [renameTicketQuantity, setRenameTicketQuantity] = useState(
    initialProfile?.renameTicketQuantity ?? 0,
  );

  // Email / Password state
  const [email, setEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch current user email
  useEffect(() => {
    async function loadUser() {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        if (data?.user?.email) {
          setEmail(data.user.email);
          setNewEmail(data.user.email);
        }
      } catch (err) {
        console.error("Failed to load user email:", err);
      }
    }
    void loadUser();
  }, []);

  const handleSaveProfile = async () => {
    setSaving(true);
    setErrorMsg(null);

    try {
      const result = await updateTankProfile({
        displayName,
        avatarUrl,
        bio,
        nameColor: selectedColor,
      });
      if (!result.success) throw new Error(result.error || "Failed to save profile.");

      const savedDisplayName = result.displayName ?? displayName.trim();
      const setupComplete = result.profileSetupComplete ?? profileSetupComplete;
      const hasFreeRename = result.freeRenameAvailable ?? freeRenameAvailable;
      const ticketQuantity = result.renameTicketQuantity ?? renameTicketQuantity;

      setDisplayName(savedDisplayName);
      setProfileSetupComplete(setupComplete);
      setFreeRenameAvailable(hasFreeRename);
      setRenameTicketQuantity(ticketQuantity);

      onProfileUpdated?.({
        displayName: savedDisplayName,
        avatarUrl,
        bio,
        nameColor: selectedColor,
        profileSetupComplete: setupComplete,
        freeRenameAvailable: hasFreeRename,
        renameTicketQuantity: ticketQuantity,
      });
      try {
        localStorage.setItem(
          "tank_local_profile",
          JSON.stringify({ displayName: savedDisplayName, avatarUrl, bio, nameColor: selectedColor }),
        );
      } catch {}
    } catch (err) {
      setSaving(false);
      setErrorMsg(err instanceof Error ? err.message : "Failed to save profile.");
      return;
    }

    setSaving(false);
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      onClose();
    }, 400);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Profile"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        <ChromePanel
          withScrews
          className="flex h-full w-full flex-col overflow-hidden shadow-2xl"
          contentClassName="!p-0 flex flex-1 flex-col overflow-hidden"
        >
          {/* Top Header Strip with Red Close Button */}
          <div className="relative flex items-center justify-between border-b border-black/40 px-8 py-3.5">
            <h2
              className="text-xs font-black uppercase tracking-widest text-[#241f14]"
              style={{ fontFamily: ACTIVE_THEME.fonts.label }}
            >
              Profile Settings
            </h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="grid h-6 w-6 place-items-center rounded border border-black/40 bg-[#e85a4f] text-white shadow transition hover:brightness-110 active:scale-95"
            >
              <X className="h-3.5 w-3.5 stroke-[3]" />
            </button>
          </div>

          {/* 3 Top Category Tabs: Profile, Account, Billing */}
          <div className="flex gap-2 px-8 pt-3 pb-2 border-b border-black/30">
            <ConsoleButton
              variant={activeTab === "profile" ? "orange" : "gray"}
              onClick={() => { setActiveTab("profile"); setPickerOpen(false); }}
              className="flex-1"
            >
              <User className="h-3.5 w-3.5" />
              Profile
            </ConsoleButton>

            <ConsoleButton
              variant={activeTab === "account" ? "orange" : "gray"}
              onClick={() => { setActiveTab("account"); setPickerOpen(false); }}
              className="flex-1"
            >
              <Lock className="h-3.5 w-3.5" />
              Account
            </ConsoleButton>

            <ConsoleButton
              variant={activeTab === "billing" ? "orange" : "gray"}
              onClick={() => { setActiveTab("billing"); setPickerOpen(false); }}
              className="flex-1"
            >
              <CreditCard className="h-3.5 w-3.5" />
              Billing
            </ConsoleButton>
          </div>

          {/* Scrollable Modal Content */}
          <div className="flex-1 overflow-y-auto px-8 py-3.5 pb-6 space-y-4">
            {/* ═══════════ PROFILE TAB ═══════════ */}
            {activeTab === "profile" && !pickerOpen && (
              <div className="space-y-3.5">
                {!profileSetupComplete && (
                  <div className="rounded border border-[#ff7a00]/70 bg-[#ff7a00]/15 p-3 text-[#241f14]">
                    <p className="text-xs font-black uppercase tracking-wider">
                      Finish Tank Setup
                    </p>
                    <p className="mt-1 text-[11px] font-bold leading-relaxed">
                      Confirm or replace the imported name below. This setup choice does not use your free rename.
                      {initialProfile?.emailVerified
                        ? " Your platform email is verified."
                        : " Verify your platform email before participating in member-only features."}
                    </p>
                  </div>
                )}

                {/* Top Row: Avatar Box + Meta Fields */}
                <div className="flex gap-4 items-start">
                  {/* Avatar Preview & Change Button */}
                  <div className="flex flex-col items-center gap-1.5 shrink-0">
                    <div className="relative h-20 w-20 overflow-hidden rounded border border-black/60 bg-black/80 shadow-inner flex items-center justify-center p-1">
                      <img
                        src={avatarUrl}
                        alt="Avatar"
                        className="h-full w-full object-contain drop-shadow-sm"
                        onError={() =>
                          setAvatarUrl(
                            "https://db.unenter.live/storage/v1/object/public/tank-avatars/default.png"
                          )
                        }
                      />
                    </div>
                    <ConsoleButton
                      variant="gray"
                      onClick={() => setPickerOpen(true)}
                      className="!py-1 !px-3 !text-[11px] w-full"
                    >
                      Change
                    </ConsoleButton>
                  </div>

                  {/* Name, Color, Season Pass & Joined */}
                  <div className="flex-1 space-y-2">
                    {/* Display Name & Color Swatch */}
                    <div>
                      <div className="flex items-center justify-between text-xs font-black uppercase tracking-wider text-[#241f14] mb-1" style={{ fontFamily: ACTIVE_THEME.fonts.label }}>
                        <span>Display Name</span>
                        <span>Color</span>
                      </div>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          minLength={3}
                          maxLength={24}
                          required
                          className="h-8 min-w-0 flex-1 rounded border border-black/60 bg-black/90 px-2.5 text-xs font-bold text-white shadow-inner outline-none focus:border-yellow-400"
                        />
                        {/* Color Selector Button */}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setColorPickerOpen((prev) => !prev)}
                            className="h-8 w-8 rounded border border-black/60 shadow-inner grid place-items-center transition active:scale-95"
                            style={{ backgroundColor: selectedColor }}
                            title="Pick Name Color"
                          />

                          {/* Color Swatch Popup */}
                          {colorPickerOpen && (
                            <div className="absolute right-0 top-full z-50 mt-1 grid grid-cols-4 gap-1.5 rounded border border-black/60 bg-black/95 p-2 shadow-2xl backdrop-blur-md">
                              {NAME_COLORS.map((c) => (
                                <button
                                  key={c.value}
                                  type="button"
                                  onClick={() => {
                                    setSelectedColor(c.value);
                                    setColorPickerOpen(false);
                                  }}
                                  className={`h-6 w-6 rounded border transition active:scale-95 ${
                                    selectedColor === c.value
                                      ? "ring-2 ring-white border-white scale-110"
                                      : "border-black/40 hover:scale-105"
                                  }`}
                                  style={{ backgroundColor: c.value }}
                                  title={c.label}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <p className="mt-1 text-[10px] font-bold text-[#4c4630]">
                        {!profileSetupComplete
                          ? "Choose 3–24 characters to finish setup."
                          : freeRenameAvailable
                            ? "One free rename is available."
                            : renameTicketQuantity > 0
                              ? `${renameTicketQuantity} Rename Ticket${renameTicketQuantity === 1 ? "" : "s"} available.`
                              : "Another rename requires a Rename Ticket."}
                      </p>
                    </div>

                    {/* Season Pass & Joined Info */}
                    <div className="flex items-center justify-between text-[11px] font-black uppercase text-[#333]" style={{ fontFamily: ACTIVE_THEME.fonts.label }}>
                      <span>Season Pass: No</span>
                      <button
                        type="button"
                        onClick={onOpenSeasonPass}
                        className="text-[#ff4d00] hover:underline"
                      >
                        (Buy Pass)
                      </button>
                    </div>

                    <div className="text-[11px] font-black uppercase text-[#444]" style={{ fontFamily: ACTIVE_THEME.fonts.label }}>
                      <span>Joined: 11/17/2023</span>
                    </div>
                  </div>
                </div>

                {/* Bio Field */}
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-[#241f14] mb-1" style={{ fontFamily: ACTIVE_THEME.fonts.label }}>
                    Bio
                  </label>
                  <textarea
                    rows={3}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Tell the chat about yourself..."
                    className="w-full rounded border border-black/60 bg-black/90 p-2.5 text-xs font-medium text-white shadow-inner outline-none focus:border-yellow-400 resize-none"
                  />
                </div>

                {/* Error Banner */}
                {errorMsg && (
                  <p className="rounded bg-red-950/80 p-2 text-xs font-bold text-red-200 border border-red-800">
                    {errorMsg}
                  </p>
                )}

                {/* Save Button */}
                <div className="flex justify-end pt-1">
                  <ConsoleButton
                    variant="orange"
                    onClick={handleSaveProfile}
                    disabled={saving}
                    className="!px-6 !py-2"
                  >
                    {saving ? (
                      "Saving..."
                    ) : saveSuccess ? (
                      <>
                        <Check className="h-4 w-4 text-emerald-400" />
                        Saved!
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        {profileSetupComplete ? "Save Changes" : "Finish Setup"}
                      </>
                    )}
                  </ConsoleButton>
                </div>
              </div>
            )}

            {/* ═══════════ AVATAR PICKER VIEW ═══════════ */}
            {activeTab === "profile" && pickerOpen && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setPickerOpen(false)}
                    className="flex items-center gap-1 text-xs font-black uppercase tracking-wide text-[#241f14] hover:text-[#ff4d00]"
                    style={{ fontFamily: ACTIVE_THEME.fonts.label }}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back to Profile
                  </button>
                  <span className="text-[11px] font-black uppercase text-[#444]" style={{ fontFamily: ACTIVE_THEME.fonts.label }}>
                    Choose Avatar
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-2.5 max-h-[50vh] overflow-y-auto p-1 bg-black/80 rounded border border-black/60">
                  {PRESET_AVATARS.map((filename) => {
                    const fullUrl = `https://db.unenter.live/storage/v1/object/public/tank-avatars/${filename}`;
                    const isSelected = avatarUrl === fullUrl;
                    return (
                      <button
                        key={filename}
                        type="button"
                        onClick={() => {
                          setAvatarUrl(fullUrl);
                          setPickerOpen(false);
                        }}
                        className={`group relative flex flex-col items-center justify-center p-1.5 rounded border transition active:scale-95 ${
                          isSelected
                            ? "border-yellow-400 bg-yellow-400/20 ring-2 ring-yellow-400"
                            : "border-white/10 bg-black/60 hover:border-white/30"
                        }`}
                      >
                        <div className="relative h-12 w-12 overflow-hidden flex items-center justify-center">
                          <img
                            src={fullUrl}
                            alt={filename}
                            className="h-full w-full object-contain drop-shadow-sm"
                            loading="lazy"
                          />
                        </div>
                        <span className="mt-1 max-w-full truncate text-[9px] font-bold text-slate-400 group-hover:text-white">
                          {filename.replace(".png", "")}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ═══════════ ACCOUNT TAB ═══════════ */}
            {activeTab === "account" && (
              <div className="space-y-3.5">
                <div>
                  <label className="block text-xs font-black uppercase tracking-wide text-[#241f14] mb-1" style={{ fontFamily: ACTIVE_THEME.fonts.label }}>
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="h-8 w-full rounded border border-black/60 bg-black/90 px-2.5 text-xs font-bold text-white shadow-inner outline-none focus:border-yellow-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase tracking-wide text-[#241f14] mb-1" style={{ fontFamily: ACTIVE_THEME.fonts.label }}>
                    Change Password
                  </label>
                  <input
                    type="password"
                    placeholder="Current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="h-8 w-full rounded border border-black/60 bg-black/90 px-2.5 text-xs font-bold text-white shadow-inner outline-none focus:border-yellow-400 mb-2"
                  />
                  <input
                    type="password"
                    placeholder="New password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="h-8 w-full rounded border border-black/60 bg-black/90 px-2.5 text-xs font-bold text-white shadow-inner outline-none focus:border-yellow-400 mb-2"
                  />
                  <input
                    type="password"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="h-8 w-full rounded border border-black/60 bg-black/90 px-2.5 text-xs font-bold text-white shadow-inner outline-none focus:border-yellow-400"
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <ConsoleButton
                    variant="orange"
                    onClick={() => {
                      alert("Password/Email update requested.");
                      onClose();
                    }}
                    className="!px-6 !py-2"
                  >
                    Update Account
                  </ConsoleButton>
                </div>
              </div>
            )}

            {/* ═══════════ BILLING TAB ═══════════ */}
            {activeTab === "billing" && (
              <div className="space-y-4 text-center py-4">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-black/80 border border-white/10 mx-auto text-[#ffb020]">
                  <Sparkles className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase text-[#241f14]" style={{ fontFamily: ACTIVE_THEME.fonts.label }}>
                    Season Pass & Token Packs
                  </h3>
                  <p className="text-xs text-[#444] mt-1 font-bold">
                    Unlock exclusive room access, custom emotes, director cams, and bonus XP.
                  </p>
                </div>
                <div className="flex justify-center">
                  <ConsoleButton
                    variant="orange"
                    onClick={onOpenSeasonPass}
                    className="!px-6 !py-2"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open Season Store
                  </ConsoleButton>
                </div>
              </div>
            )}
          </div>
        </ChromePanel>
      </div>
    </div>
  );
}
