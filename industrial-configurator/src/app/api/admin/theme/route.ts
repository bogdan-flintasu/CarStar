import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { parseJsonBody } from '@/lib/validation/body';
import { uiThemeSchema } from '@/lib/validation/uiTheme';
import { getUiTheme, saveUiTheme } from '../../_lib/settings';

// GET – The interface theme (admin only; the public read is GET /api/theme).
export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  return NextResponse.json(await getUiTheme(), { headers: { 'Cache-Control': 'no-store' } });
}

// PUT – Replace the interface theme (admin only). See uiThemeSchema.
export async function PUT(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const parsed = await parseJsonBody(req, uiThemeSchema, 4 * 1024);
  if (!parsed.ok) return parsed.response;

  try {
    return NextResponse.json(await saveUiTheme(parsed.data), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Failed to save the UI theme:', error);
    return NextResponse.json({ error: 'Failed to save the UI theme' }, { status: 500 });
  }
}
