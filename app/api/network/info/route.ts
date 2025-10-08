import { NextRequest, NextResponse } from "next/server";
import os from "os";

export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  const nets = os.networkInterfaces();
  const addrs: Array<{ name: string; address: string; family: string }> = [];
  Object.entries(nets).forEach(([name, infos]) => {
    (infos || []).forEach((info) => {
      if (!info) return;
      if (info.family === "IPv4" && !info.internal) {
        addrs.push({ name, address: info.address, family: info.family });
      }
    });
  });
  return NextResponse.json({ addresses: addrs });
}
