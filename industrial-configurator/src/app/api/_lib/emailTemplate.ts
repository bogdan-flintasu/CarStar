import { escapeHtml as e, toHeaderSafe } from '@/lib/validation/html';
import type { SendEmailInput } from '@/lib/validation/email';

type Lead = Pick<SendEmailInput, 'name' | 'email' | 'phone' | 'message' | 'configurationSummary'>;

function dimensionsText(summary: Lead['configurationSummary']): string | null {
  const d = summary?.dimensions;
  return d ? `${d.length}×${d.width}×${d.height}m` : null;
}

/** Subject line: CR/LF and control characters stripped, length capped. */
export function buildLeadSubject(lead: Lead): string {
  const dims = dimensionsText(lead.configurationSummary) ?? 'Configurare';
  return toHeaderSafe(`Cerere Nouă - ${lead.name || lead.email} | ${dims}`, 150);
}

/**
 * HTML body of the lead email. Every interpolated value goes through escapeHtml;
 * `link` must already be the canonical, server-built configuration URL.
 */
export function buildLeadEmailHtml(lead: Lead, link: string | null): string {
  const s = lead.configurationSummary;
  const dims = s?.dimensions;
  const price =
    typeof s?.estimatedPrice === 'number' ? `€${s.estimatedPrice.toLocaleString('en-US')}` : 'N/A';
  // Multi-line messages: escape first, then turn newlines into <br/>.
  const message = lead.message ? e(lead.message).replace(/\r?\n/g, '<br/>') : null;

  return `
      <h2>Cerere Nouă de Configurare - CarStar</h2>
      <hr/>
      <h3>Detalii Contact</h3>
      <p><strong>Nume:</strong> ${e(lead.name || 'N/A')}</p>
      <p><strong>Email:</strong> ${e(lead.email)}</p>
      <p><strong>Telefon:</strong> ${e(lead.phone || 'N/A')}</p>
      ${message ? `<p><strong>Mesaj:</strong> ${message}</p>` : ''}
      <hr/>
      <h3>Sumar Configurare</h3>
      ${dims ? `<p><strong>Dimensiuni:</strong> ${e(dims.length)} × ${e(dims.width)} × ${e(dims.height)} m</p>` : ''}
      <p><strong>Suprafață:</strong> ${e(s?.floorArea ?? 'N/A')} m²</p>
      <p><strong>Fundație:</strong> ${s?.foundation ? 'DA' : 'NU'}</p>
      <p><strong>Panouri sandwich:</strong> ${s?.sandwichPanels ? 'DA' : 'NU'}</p>
      <p><strong>Geamuri:</strong> ${e(s?.openings?.windows ?? 0)}</p>
      <p><strong>Uși:</strong> ${e(s?.openings?.doors ?? 0)}</p>
      <p><strong>Uși industriale:</strong> ${e(s?.openings?.garageDoors ?? 0)}</p>
      <p><strong>Preț estimativ:</strong> ${e(price)}</p>
      ${link ? `<p><strong>Link configurare:</strong> <a href="${e(link)}">${e(link)}</a></p>` : ''}
    `;
}

/** Plain-text log used when RESEND_API_KEY is not set (local development). */
export function buildLeadLog(lead: Lead, link: string | null, from: string, to: string): string {
  const s = lead.configurationSummary;
  return [
    '── EMAIL SIMULATION (no RESEND_API_KEY) ──',
    `From: ${from}`,
    `To:   ${to}`,
    `Subject: ${buildLeadSubject(lead)}`,
    `Nume:    ${lead.name || 'N/A'}`,
    `Email:   ${lead.email}`,
    `Telefon: ${lead.phone || 'N/A'}`,
    `Mesaj:   ${lead.message || '-'}`,
    `Dimensiuni: ${dimensionsText(s) ?? 'N/A'}`,
    `Suprafață:  ${s?.floorArea ?? 'N/A'} m²`,
    `Fundație:   ${s?.foundation ? 'DA' : 'NU'}`,
    `Sandwich:   ${s?.sandwichPanels ? 'DA' : 'NU'}`,
    `Preț:       ${s?.estimatedPrice ?? 'N/A'}`,
    `Link:       ${link ?? '-'}`,
  ].join('\n');
}
