import { NextRequest, NextResponse } from 'next/server';

// Longer than the 1.5 s lookups in proxy.ts and /ref (this one writes the lead), short enough for a visitor.
const BACKEND_TIMEOUT_MS = 10_000;

export async function POST(req: NextRequest) {
  const host = req.headers.get('host') || 'travela.klikumroh.local';
  const backendUrl = process.env.BACKEND_INTERNAL_URL || process.env.API_BASE_URL || 'http://localhost:8080';

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Data formulir tidak valid' }, { status: 400 });
  }

  // Forward the visitor's IP (set by Caddy) so the backend can rate-limit per visitor, not per server.
  const forwardedFor = req.headers.get('x-forwarded-for') || '';
  // The visitor's browser, used for Meta Conversions API matching.
  const userAgent = req.headers.get('user-agent') || '';

  try {
    const res = await fetch(`${backendUrl}/api/public/prospects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Host: host,
        'X-Forwarded-Host': host,
        ...(forwardedFor ? { 'X-Forwarded-For': forwardedFor } : {}),
        ...(userAgent ? { 'User-Agent': userAgent } : {}),
      },
      body: JSON.stringify(body),
      // A hung backend must not leave the interest form on "Menghubungkan..." forever.
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
    });

    const data = await res.json().catch(() => ({ error: 'Gagal mengirim data' }));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      return NextResponse.json(
        { error: 'Server sedang lambat merespons. Silakan coba kirim lagi beberapa saat lagi.' },
        { status: 504 }
      );
    }
    return NextResponse.json({ error: 'Server sedang tidak dapat dihubungi, silakan coba lagi.' }, { status: 502 });
  }
}
