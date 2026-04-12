import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

const ADMIN_ID = "45865838";
const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/+$/, "");
const ADMIN_SECRET = process.env.ADMIN_API_SECRET || "chess-agents-admin-secret-change-me";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const userId = (session.user as any).id;
  if (userId !== ADMIN_ID) return null;
  return userId;
}

// Proxy GET requests to Express admin API
export async function GET(req: NextRequest) {
  const adminId = await requireAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Extract the sub-path: /admin/proxy/stats -> /stats
  const url = new URL(req.url);
  const subPath = url.pathname.replace("/admin/proxy", "");
  
  // De-duplicate /api prefix if API_BASE already includes it
  let targetUrl = API_BASE.endsWith("/api") 
    ? `${API_BASE}/admin${subPath}` 
    : `${API_BASE}/api/admin${subPath}`;

  console.log(`[PROXY] ${req.method} ${url.pathname} -> ${targetUrl}`);

  const res = await fetch(targetUrl, {
    headers: { "x-admin-secret": ADMIN_SECRET },
  });

  if (!res.ok) {
    const text = await res.text();
    try {
      return NextResponse.json(JSON.parse(text), { status: res.status });
    } catch {
      return NextResponse.json({ error: text || "Backend error" }, { status: res.status });
    }
  }

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

// Proxy PATCH requests (engine status updates, job retries)
export async function PATCH(req: NextRequest) {
  const adminId = await requireAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const subPath = url.pathname.replace("/admin/proxy", "");
  
  // De-duplicate /api prefix if API_BASE already includes it
  let targetUrl = API_BASE.endsWith("/api") 
    ? `${API_BASE}/admin${subPath}` 
    : `${API_BASE}/api/admin${subPath}`;

  console.log(`[PROXY] ${req.method} ${url.pathname} -> ${targetUrl}`);
  const body = await req.text();

  const res = await fetch(targetUrl, {
    method: "PATCH",
    headers: { 
      "x-admin-secret": ADMIN_SECRET,
      "Content-Type": "application/json",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    try {
      return NextResponse.json(JSON.parse(text), { status: res.status });
    } catch {
      return NextResponse.json({ error: text || "Backend error" }, { status: res.status });
    }
  }

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

// Proxy DELETE requests (engine deletion)
export async function DELETE(req: NextRequest) {
  const adminId = await requireAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const subPath = url.pathname.replace("/admin/proxy", "");
  
  // De-duplicate /api prefix if API_BASE already includes it
  let targetUrl = API_BASE.endsWith("/api") 
    ? `${API_BASE}/admin${subPath}` 
    : `${API_BASE}/api/admin${subPath}`;

  console.log(`[PROXY] ${req.method} ${url.pathname} -> ${targetUrl}`);

  const res = await fetch(targetUrl, {
    method: "DELETE",
    headers: { "x-admin-secret": ADMIN_SECRET },
  });

  if (!res.ok) {
    const text = await res.text();
    try {
      return NextResponse.json(JSON.parse(text), { status: res.status });
    } catch {
      return NextResponse.json({ error: text || "Backend error" }, { status: res.status });
    }
  }

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

// Proxy POST requests (match retries)
export async function POST(req: NextRequest) {
  const adminId = await requireAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const subPath = url.pathname.replace("/admin/proxy", "");
  
  // De-duplicate /api prefix if API_BASE already includes it
  let targetUrl = API_BASE.endsWith("/api") 
    ? `${API_BASE}/admin${subPath}` 
    : `${API_BASE}/api/admin${subPath}`;

  console.log(`[PROXY] ${req.method} ${url.pathname} -> ${targetUrl}`);
  
  // Read body as text and forward (if present)
  let body = undefined;
  try {
    const text = await req.text();
    if (text) body = text;
  } catch (e) {
    // ignore
  }

  const res = await fetch(targetUrl, {
    method: "POST",
    headers: { 
      "x-admin-secret": ADMIN_SECRET,
      "Content-Type": "application/json",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    try {
      return NextResponse.json(JSON.parse(text), { status: res.status });
    } catch {
      return NextResponse.json({ error: text || "Backend error" }, { status: res.status });
    }
  }

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
