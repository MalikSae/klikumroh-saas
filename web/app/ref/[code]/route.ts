import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  const { code } = await context.params;
  const proto = request.headers.get('x-forwarded-proto') || 'http';
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || request.nextUrl.host;
  const targetUrl = `${proto}://${host}/?ref=${encodeURIComponent(code)}`;
  const response = NextResponse.redirect(targetUrl);
  
  response.cookies.set('ref_code', code, {
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
    httpOnly: false,
    sameSite: 'lax',
  });

  // Track referral click in background
  const backendUrl = process.env.BACKEND_INTERNAL_URL || process.env.API_BASE_URL || 'http://localhost:8080';
  const forwardedFor = request.headers.get('x-forwarded-for') || '';

  try {
    await fetch(`${backendUrl}/api/public/referral-clicks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Host': host,
        'X-Forwarded-Host': host,
        'X-Forwarded-For': forwardedFor,
      },
      body: JSON.stringify({ referral_code: code }),
    });
  } catch (err) {
    // Non-blocking: redirect still succeeds even if tracking fails temporarily
    console.error('Failed to record referral click:', err);
  }

  return response;
}
