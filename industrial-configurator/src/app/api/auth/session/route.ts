import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/guard';

// GET – Whether the caller is a signed-in admin (the session cookie is httpOnly, so pages ask here).
// The configurator shows its "save as model" bar only to admins; every admin API still checks the session itself.
export async function GET(req: NextRequest) {
  return NextResponse.json({ admin: getAdminSession(req) !== null }, { headers: { 'Cache-Control': 'no-store' } });
}
