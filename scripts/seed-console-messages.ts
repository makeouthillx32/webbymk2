import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";

if (!supabaseServiceKey) {
  console.log("No Supabase service key found, testing in fallback mode.");
  process.exit(0);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  console.log("Seeding modeled console and chat messages into db.unenter.live...");

  const rooms = ["room-program", "director", "living-room"];

  for (const roomId of rooms) {
    // 1. System Console Directive Card
    await supabase.from("tank_chat_messages").insert({
      room_id: roomId,
      user_id: null,
      user_name: "SYSTEM",
      user_role: "admin",
      body: "⚡ [SYSTEM CONSOLE] Telemetry Link Established — 7 Ingest Feeds Online (9.8 Mbps Program Out) · RAM-backed /dev/shm live cache enabled.",
    });

    // 2. House Event Card
    await supabase.from("tank_chat_messages").insert({
      room_id: roomId,
      user_id: null,
      user_name: "HOUSE EVENT",
      user_role: "admin",
      body: "🔥 [HOUSE EVENT] 2x XP Surge Active for the next 15 minutes! Chat, participate in House Trivia, or solve camera scavenger quests for double rewards!",
    });

    // 3. Level Up Celebration Card
    await supabase.from("tank_chat_messages").insert({
      room_id: roomId,
      user_id: null,
      user_name: "SYSTEM",
      user_role: "admin",
      body: "🎉 [LEVEL UP] Unenter reached Level 10 (Regular Rank)! +50 Tokens unlocked.",
    });

    // 4. Modeled User Chats with Ranks & Badges
    await supabase.from("tank_chat_messages").insert([
      {
        room_id: roomId,
        user_name: "CyberSpectator",
        user_role: "viewer",
        body: "streams looking super smooth right now, zero latency on 5G!",
      },
      {
        room_id: roomId,
        user_name: "ViperCam",
        user_role: "member",
        body: "game room angle is wild, who's in there right now? 👀",
      },
      {
        room_id: roomId,
        user_name: "DirectorOps",
        user_role: "moderator",
        body: "!multiplier",
      },
    ]);
  }

  console.log("Successfully seeded rich modeled chat and console messages across all rooms!");
}

main().catch(console.error);
