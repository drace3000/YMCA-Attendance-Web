const { createClient } = require("@supabase/supabase-js");
const { readFileSync } = require("fs");
const { join } = require("path");

function loadEnv() {
  const envPath = join(__dirname, "..", "web", ".env.local");
  try {
    const envContent = readFileSync(envPath, "utf-8");
    const env = {};
    envContent.split("\n").forEach((line) => {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        const [, key, value] = match;
        env[key.trim()] = value.trim().replace(/^["']|["']$/g, "");
      }
    });
    return env;
  } catch (err) {
    console.error(`Failed to load .env.local: ${err.message}`);
    process.exit(1);
  }
}

const env = loadEnv();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  console.error("Error: NEXT_PUBLIC_SUPABASE_URL is required");
  process.exit(1);
}

if (!SUPABASE_KEY) {
  console.error("Error: SUPABASE_SERVICE_ROLE_KEY is required");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const OLD_CLASS_ID = "f49c645a-166c-4904-9066-9be9977604fb";
const NEW_CLASS_ID = "5cbe0f98-4488-442e-9301-db4c28377672";

async function main() {
  console.log("=".repeat(60));
  console.log("Migration: SILVER CYCLE -> SILVER CYCLE (TM)");
  console.log("=".repeat(60));
  console.log();

  try {
    console.log("Step 1: Verifying classes exist...");
    const { data: oldClass, error: oldError } = await supabase
      .from("classes")
      .select("id, name, is_active")
      .eq("id", OLD_CLASS_ID)
      .single();

    if (oldError || !oldClass) {
      console.error(`Error: Old class not found: ${oldError?.message || "Not found"}`);
      process.exit(1);
    }

    const { data: newClass, error: newError } = await supabase
      .from("classes")
      .select("id, name, is_active")
      .eq("id", NEW_CLASS_ID)
      .single();

    if (newError || !newClass) {
      console.error(`Error: New class not found: ${newError?.message || "Not found"}`);
      process.exit(1);
    }

    console.log(`Found old class: "${oldClass.name}" (ID: ${oldClass.id})`);
    console.log(`Found new class: "${newClass.name}" (ID: ${newClass.id})`);
    console.log();

    console.log("Step 2: Checking for associated sessions...");
    const { data: sessions, error: sessionsError } = await supabase
      .from("class_sessions")
      .select("id, session_date, day_of_week, start_time, headcount")
      .eq("class_id", OLD_CLASS_ID);

    if (sessionsError) {
      console.error(`Error querying sessions: ${sessionsError.message}`);
      process.exit(1);
    }

    const sessionCount = sessions?.length || 0;
    console.log(`Found ${sessionCount} session(s) associated with "${oldClass.name}"`);

    if (sessionCount > 0) {
      const sampleSessions = sessions.slice(0, 5);
      console.log("\nSample sessions to migrate:");
      sampleSessions.forEach((s, i) => {
        console.log(
          `  ${i + 1}. ${s.session_date || s.day_of_week} ${s.start_time} (headcount: ${s.headcount || "N/A"})`
        );
      });
      if (sessionCount > 5) {
        console.log(`  ... and ${sessionCount - 5} more`);
      }
    }
    console.log();

    if (sessionCount > 0) {
      console.log("Step 3: Migrating sessions...");
      const { data: updatedSessions, error: updateError } = await supabase
        .from("class_sessions")
        .update({ class_id: NEW_CLASS_ID })
        .eq("class_id", OLD_CLASS_ID)
        .select("id");

      if (updateError) {
        console.error(`Error migrating sessions: ${updateError.message}`);
        process.exit(1);
      }

      const updatedCount = updatedSessions?.length || 0;
      console.log(`Successfully migrated ${updatedCount} session(s) to "${newClass.name}"`);
      console.log();
    } else {
      console.log("Step 3: No sessions to migrate, skipping...");
      console.log();
    }

    console.log("Step 4: Deactivating old class...");
    const { data: deactivatedClass, error: deactivateError } = await supabase
      .from("classes")
      .update({ is_active: false })
      .eq("id", OLD_CLASS_ID)
      .select("id, name, is_active")
      .single();

    if (deactivateError) {
      console.error(`Error deactivating class: ${deactivateError.message}`);
      process.exit(1);
    }

    console.log(`Successfully deactivated "${deactivatedClass.name}"`);
    console.log();

    console.log("Step 5: Verifying migration...");
    const { data: verifySessions, error: verifyError } = await supabase
      .from("class_sessions")
      .select("id")
      .eq("class_id", OLD_CLASS_ID);

    if (verifyError) {
      console.error(`Error verifying migration: ${verifyError.message}`);
      process.exit(1);
    }

    const remainingSessions = verifySessions?.length || 0;
    if (remainingSessions > 0) {
      console.warn(`Warning: ${remainingSessions} session(s) still reference the old class`);
    } else {
      console.log("Verification passed: No sessions reference the old class");
    }

    const { data: newClassSessions, error: newSessionsError } = await supabase
      .from("class_sessions")
      .select("id")
      .eq("class_id", NEW_CLASS_ID);

    if (!newSessionsError) {
      const newSessionCount = newClassSessions?.length || 0;
      console.log(`New class now has ${newSessionCount} total session(s)`);
    }

    console.log();
    console.log("=".repeat(60));
    console.log("Migration completed successfully!");
    console.log("=".repeat(60));
  } catch (error) {
    console.error("Unexpected error:", error);
    process.exit(1);
  }
}

main();
















