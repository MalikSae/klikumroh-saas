import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const host = req.headers.get('host') || 'travela.klikumroh.local';
  const body = await req.json();
  const backendUrl = process.env.BACKEND_INTERNAL_URL || process.env.API_BASE_URL || 'http://localhost:8080';

  try {
    const res = await fetch(`${backendUrl}/api/public/prospects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Host': host,
        'X-Forwarded-Host': host,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server connection error' }, { status: 500 });
  }
}
