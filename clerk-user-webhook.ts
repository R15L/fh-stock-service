import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.5";

const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_KEY"));

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  let body;
  try {
    body = await req.json();
  } catch (e) {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Clerk webhook event types: user.created, user.updated
  const eventType = body.type;
  const user = body.data;
  if (!user || !user.id) {
    return new Response("Missing user data", { status: 400 });
  }

  const email = user.email_addresses?.[0]?.email_address || null;
  const { error } = await supabase.from("user_settings").upsert({
    user_id: user.id,
    email,
    username: user.username,
    first_name: user.first_name,
    last_name: user.last_name,
    image_url: user.image_url,
    updated_at: new Date().toISOString(),
  }, { onConflict: ["user_id"] });

  if (error) {
    console.error("Error upserting user_settings:", error);
    return new Response("Supabase error", { status: 500 });
  }

  return new Response("OK", { status: 200 });
}); 