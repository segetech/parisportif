import nodemailer from "nodemailer";
import crypto from "crypto";

const host = process.env.EMAIL_HOST || "mail.buymore.ml";
const port = parseInt(process.env.EMAIL_PORT || "465", 10);
const secure = process.env.EMAIL_SECURE !== "false";
const user = process.env.EMAIL_USER || "pari@buymore.ml";
const pass = process.env.EMAIL_PASSWORD;

const DEFAULT_RESEND_FROM = "OPEN Plateforme <onboarding@resend.dev>";

// Do not attempt to initialize real SMTP transport if password is missing or during tests
const transporter = pass
  ? nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    })
  : null;

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  forceLiveInTest?: boolean;
}

export interface SendEmailResult {
  messageId: string | null;
  provider: "resend" | "smtp" | "mock";
  to: string;
  restricted?: boolean;
  error?: string;
}

async function postToResend(
  apiKey: string,
  payload: {
    from: string;
    to: string[];
    subject: string;
    html: string;
    reply_to?: string;
  },
) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
    name?: string;
    statusCode?: number;
  };

  return { ok: response.ok, status: response.status, data };
}

export async function sendViaResend(
  options: SendEmailOptions,
  apiKey = process.env.RESEND_API_KEY,
): Promise<SendEmailResult> {
  if (!apiKey) {
    return {
      messageId: null,
      provider: "mock",
      to: options.to,
      error: "RESEND_API_KEY manquante",
    };
  }

  const configuredFrom =
    options.from || process.env.RESEND_FROM_EMAIL || DEFAULT_RESEND_FROM;

  let res = await postToResend(apiKey, {
    from: configuredFrom,
    to: [options.to],
    subject: options.subject,
    html: options.html,
    ...(options.replyTo ? { reply_to: options.replyTo } : {}),
  });

  // If custom sender domain is not verified in Resend, retry once with onboarding@resend.dev
  if (
    !res.ok &&
    (res.status === 403 || res.status === 422) &&
    configuredFrom !== DEFAULT_RESEND_FROM &&
    String(res.data?.message || "").toLowerCase().includes("domain")
  ) {
    res = await postToResend(apiKey, {
      from: DEFAULT_RESEND_FROM,
      to: [options.to],
      subject: options.subject,
      html: options.html,
      ...(options.replyTo ? { reply_to: options.replyTo } : {}),
    });
  }

  if (res.ok && res.data?.id) {
    return {
      messageId: res.data.id,
      provider: "resend",
      to: options.to,
    };
  }

  const errorMessage =
    res.data?.message || `Erreur Resend HTTP ${res.status}`;
  const isSandboxRestriction =
    res.status === 403 &&
    (errorMessage.toLowerCase().includes("only send testing emails") ||
      errorMessage.toLowerCase().includes("verify a domain"));

  if (isSandboxRestriction) {
    console.warn(`[Resend Sandbox] ${options.to}: ${errorMessage}`);
    return {
      messageId: null,
      provider: "resend",
      to: options.to,
      restricted: true,
      error: errorMessage,
    };
  }

  console.error("[Resend] Send failure:", res.status, errorMessage);
  return {
    messageId: null,
    provider: "resend",
    to: options.to,
    error: errorMessage,
  };
}

export async function sendEmail(
  options: SendEmailOptions,
): Promise<SendEmailResult> {
  if (process.env.NODE_ENV === "test" && !options.forceLiveInTest) {
    return {
      messageId: "mock-test-email-id",
      provider: "mock",
      to: options.to,
    };
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    return await sendViaResend(options, resendKey);
  }

  if (!transporter) {
    return {
      messageId: "mock-test-email-id",
      provider: "mock",
      to: options.to,
    };
  }

  try {
    const result = await transporter.sendMail({
      from: options.from || user,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });
    return {
      messageId: result?.messageId || null,
      provider: "smtp",
      to: options.to,
    };
  } catch (error) {
    console.error("Email sending error:", error);
    throw new Error("Failed to send email");
  }
}

function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface OpenEmailTemplateParams {
  badge: string;
  badgeColor?: "green" | "red" | "amber" | "blue";
  title: string;
  greeting?: string;
  intro: string;
  details?: Array<{ label: string; value: string }>;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
}

const BADGE_PALETTE: Record<
  NonNullable<OpenEmailTemplateParams["badgeColor"]>,
  { bg: string; text: string }
> = {
  green: { bg: "#006B2D", text: "#FFFFFF" },
  red: { bg: "#DC2626", text: "#FFFFFF" },
  amber: { bg: "#D97706", text: "#FFFFFF" },
  blue: { bg: "#1D4ED8", text: "#FFFFFF" },
};

export function buildOpenNotificationEmailHtml(
  params: OpenEmailTemplateParams,
): string {
  const badgeStyle = BADGE_PALETTE[params.badgeColor || "green"];
  const detailsRows = (params.details || [])
    .filter((item) => item.value !== undefined && item.value !== "")
    .map(
      (item) => `
      <tr>
        <td style="padding: 10px 14px; font-size: 13px; color: #556B5C; border-bottom: 1px solid #D8E6DB; width: 38%; font-weight: 600;">
          ${escapeHtml(item.label)}
        </td>
        <td style="padding: 10px 14px; font-size: 13px; color: #17251C; border-bottom: 1px solid #D8E6DB; font-weight: 700;">
          ${escapeHtml(item.value)}
        </td>
      </tr>`,
    )
    .join("");

  const detailsBlock = detailsRows
    ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin: 20px 0; border-collapse: collapse; background-color: #F5F8F5; border: 1px solid #D8E6DB; border-radius: 8px;">
        ${detailsRows}
      </table>`
    : "";

  const ctaBlock =
    params.ctaUrl && params.ctaLabel
      ? `<div style="margin: 26px 0 10px 0;">
          <a href="${escapeHtml(params.ctaUrl)}" style="display: inline-block; background-color: #006B2D; color: #FFFFFF; text-decoration: none; font-size: 14px; font-weight: 700; padding: 12px 24px; border-radius: 8px; border: 1px solid #004D20;">
            ${escapeHtml(params.ctaLabel)}
          </a>
        </div>`
      : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(params.title)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F5F8F5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #17251C;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F5F8F5; padding: 28px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #FFFFFF; border: 1px solid #D8E6DB; border-radius: 12px; overflow: hidden;">
          <tr>
            <td style="background-color: #004D20; padding: 20px 28px; border-bottom: 4px solid #FFD000;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="font-size: 18px; font-weight: 800; color: #FFFFFF; letter-spacing: 0.4px;">
                    OPEN • Contrôle &amp; Audit des Opérateurs
                  </td>
                  <td align="right">
                    <span style="display: inline-block; background-color: ${badgeStyle.bg}; color: ${badgeStyle.text}; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 999px; text-transform: uppercase;">
                      ${escapeHtml(params.badge)}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 28px;">
              ${
                params.greeting
                  ? `<p style="margin: 0 0 12px 0; font-size: 14px; color: #556B5C;">${escapeHtml(params.greeting)}</p>`
                  : ""
              }
              <h1 style="margin: 0 0 12px 0; font-size: 20px; line-height: 1.3; color: #17251C; font-weight: 800;">
                ${escapeHtml(params.title)}
              </h1>
              <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #17251C;">
                ${escapeHtml(params.intro)}
              </p>
              ${detailsBlock}
              ${ctaBlock}
            </td>
          </tr>
          <tr>
            <td style="background-color: #F5F8F5; padding: 16px 28px; border-top: 1px solid #D8E6DB; font-size: 12px; color: #556B5C;">
              ${escapeHtml(
                params.footerNote ||
                  "Ceci est une notification automatique de la plateforme OPEN. Merci de ne pas y répondre directement.",
              )}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function generatePasswordResetToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function generatePasswordResetLink(
  token: string,
  baseUrl: string,
): string {
  return `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
}
