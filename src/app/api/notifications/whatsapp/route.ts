import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/notifications/whatsapp
 * Send a WhatsApp notification via Twilio.
 *
 * Body: { to: string, message: string }
 *
 * Requires env vars:
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM
 */
export async function POST(req: NextRequest) {
  try {
    const { to, message } = await req.json();

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_WHATSAPP_FROM; // e.g. "whatsapp:+14155238886"

    if (!accountSid || !authToken || !from) {
      return NextResponse.json(
        { error: "Twilio credentials not configured" },
        { status: 500 }
      );
    }

    if (!to || !message) {
      return NextResponse.json(
        { error: "Missing 'to' or 'message' in request body" },
        { status: 400 }
      );
    }

    // Format WhatsApp number
    const whatsappTo = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;

    // Send via Twilio REST API (no SDK needed)
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const body = new URLSearchParams({
      To: whatsappTo,
      From: from,
      Body: message,
    });

    const response = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("Twilio error:", result);
      return NextResponse.json(
        { error: "Failed to send WhatsApp message", details: result },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      sid: result.sid,
      status: result.status,
    });
  } catch (error) {
    console.error("WhatsApp notification error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/notifications/whatsapp
 * Webhook endpoint for incoming WhatsApp messages (Twilio webhook).
 * Configure this URL in your Twilio console.
 */
export async function GET(req: NextRequest) {
  // Twilio sends a GET to verify the webhook URL
  return NextResponse.json({ status: "ok" });
}
