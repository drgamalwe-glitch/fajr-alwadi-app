const BRIDGE_URL = process.env.E2E_BRIDGE_URL || "http://127.0.0.1:3899";

export async function bridgeInvoke<T = unknown>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch(`${BRIDGE_URL}/__e2e/invoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command, args }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "bridge error");
  return json.data as T;
}

export async function bridgeReset(): Promise<void> {
  const res = await fetch(`${BRIDGE_URL}/__e2e/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "reset failed");
}

export async function bridgeHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${BRIDGE_URL}/__e2e/health`);
    return res.ok;
  } catch {
    return false;
  }
}
