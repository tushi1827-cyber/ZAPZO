import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = req.headers.get("apikey") || "";

    // Create a service-role client to bypass PostgREST schema cache issues
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Extract the user's JWT from the Authorization header
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");

    if (!token || token === anonKey) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Verify the user's JWT and get their ID
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const userId = userData.user.id;

    // Parse request body
    const body = await req.json();
    const { task_id, proof_text, proof_image_url } = body;

    if (!task_id) {
      return new Response(
        JSON.stringify({ error: "Task ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!proof_text || proof_text.trim().length < 10) {
      return new Response(
        JSON.stringify({ error: "Please provide detailed proof (at least 10 characters)." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Insert the submission using the service role client
    // The BEFORE INSERT trigger (guard_submission_insert) handles all validation
    // The AFTER INSERT trigger (process_submission_after_insert) handles auto-verification
    const { data: insertData, error: insertError } = await supabase
      .from("task_submissions")
      .insert({
        task_id,
        user_id: userId,
        proof_text: proof_text.trim(),
        proof_image_url: proof_image_url || null,
      })
      .select("id")
      .single();

    if (insertError) {
      const msg = insertError.message || "";
      let friendlyMsg = msg;

      if (msg.includes("already been approved")) {
        friendlyMsg = "Your submission for this task has already been approved.";
      } else if (msg.includes("pending submission")) {
        friendlyMsg = "You have a pending submission for this task. Please wait for review.";
      } else if (msg.includes("too many") || msg.includes("limit")) {
        friendlyMsg = "You are submitting tasks too quickly. Please wait a while before trying again.";
      } else if (msg.includes("suspended")) {
        friendlyMsg = "Your account is suspended. Please contact support if you believe this is an error.";
      } else if (msg.includes("flagged") || msg.includes("review")) {
        friendlyMsg = "Your account is under review. Please contact support to resolve this.";
      } else if (msg.includes("not currently accepting") || msg.includes("maximum")) {
        friendlyMsg = "This task is no longer accepting submissions.";
      } else if (msg.includes("too many rejections") || msg.includes("excessive")) {
        friendlyMsg = "You have had too many rejections on this task. Please contact support.";
      } else if (msg.includes("not found")) {
        friendlyMsg = "Task not found.";
      } else if (msg.includes("expired")) {
        friendlyMsg = "This task has expired and is no longer accepting submissions.";
      } else if (msg.includes("not started")) {
        friendlyMsg = "This task has not started yet.";
      }

      return new Response(
        JSON.stringify({ error: friendlyMsg, raw: msg }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch the full submission to return to the client
    const { data: submission, error: fetchError } = await supabase
      .from("task_submissions")
      .select("*")
      .eq("id", insertData.id)
      .maybeSingle();

    if (fetchError) {
      return new Response(
        JSON.stringify({ id: insertData.id, error: "Submission created but could not fetch details" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ id: insertData.id, submission }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
