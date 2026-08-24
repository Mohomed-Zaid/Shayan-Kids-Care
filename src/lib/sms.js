// src/lib/sms.js
import { supabase } from "./supabaseClient";
import { logAction } from "./auditLog";

/**
 * Send a single SMS
 * @param {string} number - Phone number (e.g., "94753841599")
 * @param {string} message - Message content
 */
export async function sendSingleSMS(number, message) {
    const { data, error } = await supabase.functions.invoke("send-sms", {
        body: {
            type: "single",
            number,
            message,
        },
    });
    if (error) {
        await logAction({ action: "sms_send_failed", targetType: "sms", module: "SMS", details: "Single SMS failed", status: "failed", metadata: { phone: number, message: String(message).slice(0, 160), error: error.message } });
        throw error;
    }
    await logAction({ action: "sms_sent", targetType: "sms", module: "SMS", details: "Single SMS sent", status: "sent", metadata: { phone: number, message: String(message).slice(0, 160), server_reference: data?.reference || data?.serverRef || null } });
    return data;
}

/**
 * Send bulk SMS
 * @param {Array<{ number: string; message: string }>} recipients - Array of recipients
 * @param {string} [campaignName] - Optional campaign name
 */
export async function sendBulkSMS(recipients, campaignName) {
    const { data, error } = await supabase.functions.invoke("send-sms", {
        body: {
            type: "bulk",
            recipients,
            campaignName,
        },
    });
    if (error) {
        await logAction({ action: "bulk_sms_failed", targetType: "sms_campaign", module: "SMS", targetLabel: campaignName, status: "failed", metadata: { recipient_count: recipients.length, error: error.message } });
        throw error;
    }
    await logAction({ action: "bulk_sms_sent", targetType: "sms_campaign", module: "SMS", targetLabel: campaignName, status: "sent", metadata: { recipient_count: recipients.length, server_reference: data?.reference || null } });
    return data;
}
