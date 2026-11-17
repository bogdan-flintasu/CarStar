import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { emailLimiter, getClientIp } from '@/lib/auth/rateLimit';
import { parseJsonBody } from '@/lib/validation/body';
import {
  buildConfigurationLink,
  HONEYPOT_FIELD,
  normalizeOrigin,
  parseConfigurationLink,
  sendEmailSchema,
} from '@/lib/validation/email';
import { buildLeadEmailHtml, buildLeadLog, buildLeadSubject } from '../_lib/emailTemplate';
import { getCurrentPrices, getOrSeedPalette } from '../_lib/prices';
import { resolveEmailSummary } from '../_lib/serverPrice';

const MAX_BODY_BYTES = 16 * 1024;

// POST – Send a lead email via Resend (console fallback without RESEND_API_KEY).
export async function POST(req: NextRequest) {
  const limit = emailLimiter.check(`email:${getClientIp(req.headers)}`);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = await parseJsonBody(req, sendEmailSchema, MAX_BODY_BYTES);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;

  // Honeypot filled in: pretend success so the bot learns nothing, send nothing.
  if (input[HONEYPOT_FIELD]) {
    console.warn('send-email: honeypot triggered, dropping request');
    return NextResponse.json({ success: true });
  }

  // Only links to our own /configuration/<token> pages, for tokens that exist.
  // The link in the email is rebuilt server-side from the token.
  let link: string | null = null;
  let storedData: unknown = undefined;
  if (input.configurationLink) {
    const origin = normalizeOrigin(process.env.APP_BASE_URL) ?? req.nextUrl.origin;
    const token = parseConfigurationLink(input.configurationLink, origin);
    const saved =
      token && (await prisma.configuration.findUnique({ where: { token }, select: { data: true } }));
    if (!token || !saved) {
      return NextResponse.json({ error: 'Invalid configuration link' }, { status: 400 });
    }
    link = buildConfigurationLink(origin, token);
    storedData = saved.data;
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@yourdomain.com';
  const toEmail = process.env.RESEND_TO_EMAIL || 'contact@yourdomain.com';

  try {
    // B5: the quoted price is recomputed with DB prices, never taken from the client.
    const summary = resolveEmailSummary(
      storedData,
      input.configurationSummary,
      await getCurrentPrices(),
      await getOrSeedPalette(),
    );
    // The starting model is named only if it exists (a client-sent summary could claim any name).
    if (summary?.model) {
      const model = await prisma.hallModel.findUnique({ where: { id: summary.model.id }, select: { id: true, name: true } });
      summary.model = model ?? undefined;
    }
    const lead = { ...input, configurationSummary: summary };
    if (apiKey) {
      const { Resend } = await import('resend');
      const resend = new Resend(apiKey);
      const { error } = await resend.emails.send({
        from: fromEmail,
        to: [toEmail],
        replyTo: input.email,
        subject: buildLeadSubject(lead),
        html: buildLeadEmailHtml(lead, link),
      });
      if (error) throw new Error(error.message);
    } else {
      console.log(buildLeadLog(lead, link, fromEmail, toEmail));
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to send email:', error);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}
