import { NextRequest, NextResponse } from 'next/server';

// POST – Send configuration email via Resend (with console fallback)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, phone, message, configurationLink, configurationSummary } = body;

    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@yourdomain.com';
    const toEmail = process.env.RESEND_TO_EMAIL || 'contact@yourdomain.com';

    // Build email HTML
    const dims = configurationSummary?.dimensions;
    const htmlBody = `
      <h2>Cerere Nouă de Configurare - CarStar</h2>
      <hr/>
      <h3>Detalii Contact</h3>
      <p><strong>Nume:</strong> ${name || 'N/A'}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Telefon:</strong> ${phone || 'N/A'}</p>
      ${message ? `<p><strong>Mesaj:</strong> ${message}</p>` : ''}
      <hr/>
      <h3>Sumar Configurare</h3>
      ${dims ? `<p><strong>Dimensiuni:</strong> ${dims.length} × ${dims.width} × ${dims.height} m</p>` : ''}
      <p><strong>Suprafață:</strong> ${configurationSummary?.floorArea || 'N/A'} m²</p>
      <p><strong>Fundație:</strong> ${configurationSummary?.foundation ? 'DA' : 'NU'}</p>
      <p><strong>Panouri sandwich:</strong> ${configurationSummary?.sandwichPanels ? 'DA' : 'NU'}</p>
      <p><strong>Geamuri:</strong> ${configurationSummary?.openings?.windows || 0}</p>
      <p><strong>Uși:</strong> ${configurationSummary?.openings?.doors || 0}</p>
      <p><strong>Uși industriale:</strong> ${configurationSummary?.openings?.garageDoors || 0}</p>
      <p><strong>Preț estimativ:</strong> €${configurationSummary?.estimatedPrice?.toLocaleString('en-US') || 'N/A'}</p>
      ${configurationLink ? `<p><strong>Link configurare:</strong> <a href="${configurationLink}">${configurationLink}</a></p>` : ''}
    `;

    if (apiKey) {
      // Send via Resend
      const { Resend } = await import('resend');
      const resend = new Resend(apiKey);

      await resend.emails.send({
        from: fromEmail,
        to: [toEmail],
        subject: `Cerere Nouă - ${name || email} | ${dims ? `${dims.length}×${dims.width}×${dims.height}m` : 'Configurare'}`,
        html: htmlBody,
      });

      console.log('✅ Email sent via Resend to:', toEmail);
    } else {
      // Fallback: log to console for local development
      console.log('\n╔══════════════════════════════════════════════════╗');
      console.log('║       📧  EMAIL SIMULATION (no API key)         ║');
      console.log('╠══════════════════════════════════════════════════╣');
      console.log(`║ From: ${fromEmail}`);
      console.log(`║ To:   ${toEmail}`);
      console.log(`║ Subject: Cerere Nouă - ${name || email}`);
      console.log('╠══════════════════════════════════════════════════╣');
      console.log(`║ Nume:    ${name || 'N/A'}`);
      console.log(`║ Email:   ${email}`);
      console.log(`║ Telefon: ${phone || 'N/A'}`);
      console.log(`║ Mesaj:   ${message || '-'}`);
      console.log('╠══════════════════════════════════════════════════╣');
      if (dims) console.log(`║ Dimensiuni: ${dims.length} × ${dims.width} × ${dims.height} m`);
      console.log(`║ Suprafață:  ${configurationSummary?.floorArea || 'N/A'} m²`);
      console.log(`║ Fundație:   ${configurationSummary?.foundation ? 'DA' : 'NU'}`);
      console.log(`║ Sandwich:   ${configurationSummary?.sandwichPanels ? 'DA' : 'NU'}`);
      console.log(`║ Preț:       €${configurationSummary?.estimatedPrice?.toLocaleString('en-US') || 'N/A'}`);
      if (configurationLink) console.log(`║ Link: ${configurationLink}`);
      console.log('╚══════════════════════════════════════════════════╝\n');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to send email:', error);
    return NextResponse.json(
      { error: 'Failed to send email' },
      { status: 500 }
    );
  }
}
