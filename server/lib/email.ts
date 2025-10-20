import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: "mail.buymore.ml",
  port: 465,
  secure: true,
  auth: {
    user: "pari@buymore.ml",
    pass: process.env.EMAIL_PASSWORD || "6S]Op9=sO?wUeI2@",
  },
});

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(options: SendEmailOptions) {
  try {
    const result = await transporter.sendMail({
      from: "pari@buymore.ml",
      ...options,
    });
    return result;
  } catch (error) {
    console.error("Email sending error:", error);
    throw new Error("Failed to send email");
  }
}

export function generatePasswordResetToken(): string {
  return Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15);
}

export function generatePasswordResetLink(token: string, baseUrl: string): string {
  return `${baseUrl}/reset-password?token=${token}`;
}
