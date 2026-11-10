import { Injectable } from '@nestjs/common';
import { Resend } from 'resend';

const DEFAULT_DASHBOARD_LOGIN_URL = `${(
  process.env.APP_URL ||
  process.env.FRONTEND_URL ||
  'http://localhost:3003'
).replace(/\/+$/, '')}/login`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeHttpUrl(raw: string, fallback: string): string {
  const t = raw.trim();
  if (!/^https?:\/\//i.test(t)) return fallback;
  try {
    const u = new URL(t);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return fallback;
    return u.toString();
  } catch {
    return fallback;
  }
}

@Injectable()
export class EmailService {
  private resend = new Resend(process.env.RESEND_API_KEY);

  async sendOtpEmail(email: string, otp: string) {
    const { data, error } = await this.resend.emails.send({
      from: process.env.EMAIL_FROM || 'Fluxen POS <onboarding@resend.dev>',
      to: [email],
      subject: 'Your verification code',
      html: `
        <div style="font-family: Arial;">
          <h2>Fluxen POS</h2>
          <p>Your OTP code is:</p>
          <h1>${otp}</h1>
          <p>This code will expire in 5 minutes.</p>
        </div>
      `,
    });

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  async sendSignupVerificationEmail(email: string, name: string, otp: string) {
    const { data, error } = await this.resend.emails.send({
      from: process.env.EMAIL_FROM || 'Fluxen POS <onboarding@resend.dev>',
      to: [email],
      subject: `${otp} is your Fluxen POS verification code`,
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #18181b; max-width: 520px; margin: 0 auto; border: 1px solid #eee; border-radius: 12px; padding: 32px;">
          <h2 style="margin-top: 0;">Confirm your email</h2>
          <p>Hi ${escapeHtml(name || 'there')}, enter this code to finish creating your Fluxen POS account:</p>
          <p style="font-size: 32px; font-weight: 700; letter-spacing: 0.3em; font-family: ui-monospace, monospace; margin: 24px 0;">${otp}</p>
          <p style="font-size: 13px; color: #555;">The code expires in 5 minutes. If you did not sign up, you can ignore this email.</p>
        </div>
      `,
    });

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  /** Tells the platform operator that a business asked for a paid plan. */
  async sendPlanEnquiryEmail(
    to: string[],
    d: {
      businessName: string;
      contactName: string;
      email: string;
      phone: string | null;
      plan: string | null;
      message: string | null;
    },
  ) {
    const row = (k: string, v: string | null) =>
      v
        ? `<tr><td style="padding:4px 12px 4px 0;color:#555;">${k}</td><td style="padding:4px 0;"><b>${escapeHtml(v)}</b></td></tr>`
        : '';
    const { data, error } = await this.resend.emails.send({
      from: process.env.EMAIL_FROM || 'Fluxen POS <onboarding@resend.dev>',
      to,
      replyTo: d.email,
      subject: `Plan enquiry from ${d.businessName}`,
      html: `
        <div style="font-family: Arial;">
          <h2>New plan enquiry</h2>
          <table>
            ${row('Business', d.businessName)}
            ${row('Contact', d.contactName)}
            ${row('Email', d.email)}
            ${row('Phone', d.phone)}
            ${row('Plan', d.plan)}
            ${row('Message', d.message)}
          </table>
          <p style="font-size:13px;color:#555;">Open the operator page to activate the plan once payment is received.</p>
        </div>
      `,
    });
    if (error) {
      throw new Error(error.message);
    }
    return data;
  }

  /** Acknowledges to the business that its plan request was received. */
  async sendPlanEnquiryAckEmail(
    to: string,
    d: { contactName: string; businessName: string; plan: string | null },
  ) {
    const { data, error } = await this.resend.emails.send({
      from: process.env.EMAIL_FROM || 'Fluxen POS <onboarding@resend.dev>',
      to: [to],
      subject: 'We received your plan request',
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #18181b; max-width: 520px; margin: 0 auto; border: 1px solid #eee; border-radius: 12px; padding: 32px;">
          <h2 style="margin-top: 0;">Thanks, we got your request</h2>
          <p>Hi ${escapeHtml(d.contactName || 'there')}, we received the plan request for <b>${escapeHtml(d.businessName)}</b>${d.plan ? ` (${escapeHtml(d.plan)})` : ''}.</p>
          <p>Our team will contact you shortly with payment details. Your account keeps working in the meantime.</p>
          <p style="font-size: 13px; color: #555;">Just reply to this email if you want to add anything.</p>
        </div>
      `,
    });
    if (error) {
      throw new Error(error.message);
    }
    return data;
  }

  async sendPermissionRequestEmail(
    email: string,
    permissionsSummary: string,
    status: string,
  ) {
    const { data, error } = await this.resend.emails.send({
      from: process.env.EMAIL_FROM || 'Fluxen POS <onboarding@resend.dev>',
      to: [email],
      subject: `Access request ${status}`,
      html: `
        <div style="font-family: Arial;">
          <h2>Fluxen POS</h2>
          <p>Your request for additional access (<b>${escapeHtml(permissionsSummary)}</b>) has been <b>${escapeHtml(status)}</b>.</p>
        </div>
      `,
    });

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  async sendRoleRequestEmail(
    email: string,
    requestedRole: string,
    status: string,
  ) {
    const { data, error } = await this.resend.emails.send({
      from: process.env.EMAIL_FROM || 'Fluxen POS <onboarding@resend.dev>',
      to: [email],
      subject: `Role Request ${status}`,
      html: `
        <div style="font-family: Arial;">
          <h2>Fluxen POS</h2>
          <p>Your role request for <b>${requestedRole}</b> has been <b>${status}</b>.</p>
        </div>
      `,
    });

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  async sendWelcomeEmail(
    email: string,
    name: string,
    role: string,
    shopName: string,
    plainPassword: string,
  ) {
    const loginUrl = safeHttpUrl(
      process.env.DASHBOARD_LOGIN_URL || '',
      DEFAULT_DASHBOARD_LOGIN_URL,
    );
    const safeName = escapeHtml(name || 'User');
    const safeShop = escapeHtml(shopName);
    const safeRole = escapeHtml(role);
    const safeEmail = escapeHtml(email);
    const safePassword = escapeHtml(plainPassword);

    const { data, error } = await this.resend.emails.send({
      from: process.env.EMAIL_FROM || 'Fluxen POS <onboarding@resend.dev>',
      to: [email],
      subject: 'Welcome to Fluxen POS',
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #18181b; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 12px; padding: 32px;">
          <h2 style="color: #4f46e5; margin-top: 0;">Welcome to the Team, ${safeName}!</h2>
          <p>You have been added to <b>${safeShop}</b> as a <b>${safeRole}</b>.</p>
          <div style="background: #fdfaf6; border-radius: 8px; padding: 20px; margin: 24px 0; border: 1px solid #e8e2d9;">
            <p style="margin: 0 0 12px; font-size: 13px; color: #5c4b37; font-weight: 600;">Your sign-in details</p>
            <p style="margin: 0 0 6px; font-size: 14px; color: #18181b;"><b>Email:</b> <span style="font-family: ui-monospace, monospace;">${safeEmail}</span></p>
            <p style="margin: 0; font-size: 14px; color: #18181b;"><b>Temporary password:</b> <span style="font-family: ui-monospace, monospace; letter-spacing: 0.02em;">${safePassword}</span></p>
          </div>
          <div style="background: #fff9f0; border-radius: 8px; padding: 16px; margin: 20px 0; border: 1px solid #ecd18f;">
            <p style="margin: 0; font-size: 13px; color: #5c4b37;">
              <b>Please change your password</b> after you log in (Settings → Security) so your account stays secure. Do not forward this email.
            </p>
          </div>
          <p>Sign in to the admin dashboard:</p>
          <a href="${escapeHtml(loginUrl)}" style="display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Open login</a>
          <p style="margin-top: 12px; font-size: 13px; color: #6b4a30;">If the button does not work, copy this link:<br /><span style="word-break: break-all; font-family: ui-monospace, monospace; font-size: 12px;">${escapeHtml(loginUrl)}</span></p>
          <p style="margin-top: 32px; font-size: 12px; color: #999;">
            This is an automated message. Please do not reply to this email.
          </p>
        </div>
      `,
    });

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }
}
