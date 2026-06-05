// src/lib/sms.js
import { supabase } from "./supabaseClient";

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
    if (error) throw error;
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
    if (error) throw error;
    return data;
}
