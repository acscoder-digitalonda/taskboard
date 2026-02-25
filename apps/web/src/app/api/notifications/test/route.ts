import { NextRequest, NextResponse } from "next/server";
import {
  getAuthenticatedUserId,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { sendPushToUser } from "@/lib/web-push";

/**
 * POST /api/notifications/test
 * Send a test push notification to the authenticated user.
 * Used to verify the entire push pipeline works end-to-end:
 * client subscription → server VAPID → web-push → service worker → OS notification.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return unauthorizedResponse();

    const sent = await sendPushToUser(userId, {
      title: "TaskBoard Test",
      body: "Push notifications are working! 🎉",
      link: "/",
      id: `test-${Date.now()}`,
    });

    return NextResponse.json({
      success: true,
      devices_reached: sent,
    });
  } catch (error) {
    console.error("Test push error:", error);
    return NextResponse.json(
      { error: "Failed to send test push" },
      { status: 500 }
    );
  }
}
