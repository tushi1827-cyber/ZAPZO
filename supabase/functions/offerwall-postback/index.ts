import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function computeHmacSha256(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getParam(params: URLSearchParams, ...names: string[]): string | null {
  for (const n of names) {
    const v = params.get(n);
    if (v !== null && v !== undefined) return v;
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const secretKey = Deno.env.get("OFFERWALL_GG_SECRET_KEY");

    if (!secretKey) {
      return new Response("error", {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "text/plain" },
      });
    }

    // Parse params from GET query string or POST form body
    let params: URLSearchParams;
    if (req.method === "GET") {
      const url = new URL(req.url);
      params = url.searchParams;
    } else if (req.method === "POST") {
      const contentType = req.headers.get("content-type") || "";
      if (contentType.includes("application/x-www-form-urlencoded")) {
        const bodyText = await req.text();
        params = new URLSearchParams(bodyText);
      } else {
        const url = new URL(req.url);
        params = url.searchParams;
      }
    } else {
      return new Response("error", {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "text/plain" },
      });
    }

    // Extract Offerwall.GG fields with alias support
    const userId = getParam(params, "userId", "user_id", "user", "subid");
    const transactionId = getParam(params, "transactionId", "tx", "txid", "trans_id");
    const currencyAmount = getParam(params, "currencyAmount", "amount", "points", "reward");
    const offerId = getParam(params, "offerId", "offer_id");
    const offerName = getParam(params, "offerName", "offer_name");
    const payoutUsd = getParam(params, "payoutUsd", "payout_usd");
    const status = getParam(params, "status");
    const signature = getParam(params, "signature", "sig", "hash");
    const test = getParam(params, "test");
    const goalId = getParam(params, "goalId", "goal_id");

    // Validate required fields
    if (!userId || !transactionId || !currencyAmount || !status || !signature) {
      return new Response("error", {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "text/plain" },
      });
    }

    // Verify HMAC-SHA256 signature: hmac_sha256("userId:transactionId:currencyAmount", secretKey)
    const signedString = `${userId}:${transactionId}:${currencyAmount}`;
    const expectedSig = await computeHmacSha256(signedString, secretKey);

    if (!timingSafeEqual(signature.toLowerCase(), expectedSig.toLowerCase())) {
      // Log security event without exposing secret
      const adminClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false },
      });
      await adminClient.from("audit_logs").insert({
        actor_id: null,
        action: "offerwall_signature_failed",
        target_type: "offerwall",
        target_id: null,
        details: {
          transaction_id: transactionId,
          user_id: userId,
          reason: "signature_mismatch",
        },
      }).then(() => {}).catch(() => {});

      return new Response("error", {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "text/plain" },
      });
    }

    // Determine if this is a test callback
    const isTest = test === "1" || test === "true";

    // Parse amounts
    const points = parseFloat(currencyAmount) || 0;
    const amountUsd = payoutUsd ? parseFloat(payoutUsd) : null;

    // Map status: Offerwall.GG uses 'credited' or 'reversed'
    let mappedStatus: string;
    const statusLower = status.toLowerCase();
    if (statusLower === "credited" || statusLower === "completed" || statusLower === "approved") {
      mappedStatus = "credited";
    } else if (statusLower === "reversed" || statusLower === "chargeback" || statusLower === "cancelled") {
      mappedStatus = "reversed";
    } else {
      // Unknown status — record but don't process
      return new Response("OK", {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/plain" },
      });
    }

    // For reversal, currencyAmount is negative from Offerwall.GG
    // We use absolute value for the points in offerwall_transactions
    const pointsAbs = Math.abs(points);

    // Verify user exists in profiles using service-role client
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: profile, error: profileErr } = await adminClient
      .from("profiles")
      .select("id, is_suspended")
      .eq("id", userId)
      .maybeSingle();

    if (profileErr || !profile) {
      // Log: unknown user
      await adminClient.from("audit_logs").insert({
        actor_id: null,
        action: "offerwall_unknown_user",
        target_type: "offerwall",
        target_id: null,
        details: {
          transaction_id: transactionId,
          user_id: userId,
          reason: "user_not_found",
        },
      }).then(() => {}).catch(() => {});

      return new Response("error", {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "text/plain" },
      });
    }

    // Call the atomic SECURITY DEFINER RPC
    const { data: rpcResult, error: rpcError } = await adminClient.rpc(
      "process_offerwall_callback",
      {
        p_transaction_id: transactionId,
        p_user_id: userId,
        p_offer_id: offerId || null,
        p_offer_name: offerName || null,
        p_points: mappedStatus === "reversed" ? -pointsAbs : pointsAbs,
        p_amount_usd: amountUsd,
        p_status: mappedStatus,
        p_is_test: isTest,
      },
    );

    if (rpcError) {
      // Check if it's a unique constraint violation (already processed)
      const msg = rpcError.message || "";
      if (msg.includes("duplicate") || msg.includes("unique") || msg.includes("23505")) {
        return new Response("OK", {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "text/plain" },
        });
      }
      // Log error without exposing sensitive data
      await adminClient.from("audit_logs").insert({
        actor_id: null,
        action: "offerwall_rpc_error",
        target_type: "offerwall",
        target_id: null,
        details: {
          transaction_id: transactionId,
          user_id: userId,
          error: msg.substring(0, 200),
        },
      }).then(() => {}).catch(() => {});

      return new Response("error", {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "text/plain" },
      });
    }

    // Log successful processing for audit
    const result = rpcResult as { success?: boolean; message?: string; already_processed?: boolean } | null;
    if (result && !result.already_processed) {
      await adminClient.from("audit_logs").insert({
        actor_id: null,
        action: `offerwall_${mappedStatus}`,
        target_type: "offerwall",
        target_id: null,
        details: {
          transaction_id: transactionId,
          user_id: userId,
          offer_id: offerId,
          points: pointsAbs,
          status: mappedStatus,
          is_test: isTest,
        },
      }).then(() => {}).catch(() => {});
    }

    // Return provider-compatible success response
    return new Response("OK", {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
  } catch (err) {
    return new Response("error", {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
  }
});
