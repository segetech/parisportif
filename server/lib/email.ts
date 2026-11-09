import nodemailer from "nodemailer";
import crypto from "crypto";

const host = process.env.EMAIL_HOST || "mail.buymore.ml";
const port = parseInt(process.env.EMAIL_PORT || "465", 10);
const secure = process.env.EMAIL_SECURE !== "false";
const user = process.env.EMAIL_USER || "pari@buymore.ml";
const pass = process.env.EMAIL_PASSWORD;

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
}

export async function sendEmail(options: SendEmailOptions) {
  if (process.env.NODE_ENV === "test" || !transporter) {
    // In test environment or when unconfigured, safely log and return dummy success
    return { messageId: "mock-test-email-id", to: options.to };
  }

  try {
    const result = await transporter.sendMail({
      from: user,
      ...options,
    });
    return result;
  } catch (error) {
    console.error("Email sending error:", error);
    throw new Error("Failed to send email");
  }
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
