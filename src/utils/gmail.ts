// Search Gmail for purchase/receipt emails from the last 60 days
export async function fetchPurchaseEmails(
  accessToken: string,
): Promise<{ id: string; threadId: string }[]> {
  const q = encodeURIComponent(
    'subject:(order confirmation OR your order OR purchase confirmed OR shipped OR receipt OR order received) newer_than:60d',
  );
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=20`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (res.status === 401) throw Object.assign(new Error('token_expired'), { code: 401 });
  if (!res.ok) throw new Error('Failed to list emails');
  const data = await res.json();
  return data.messages ?? [];
}

export interface EmailMeta {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
}

export async function fetchEmailMeta(accessToken: string, id: string): Promise<EmailMeta> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata` +
      `&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error('Failed to fetch email metadata');
  const msg = await res.json();
  const headers: { name: string; value: string }[] = msg.payload?.headers ?? [];
  const h = (name: string) => headers.find(h => h.name === name)?.value ?? '';
  return { id, subject: h('Subject'), from: h('From'), date: h('Date'), snippet: msg.snippet ?? '' };
}

export async function fetchEmailHtml(accessToken: string, id: string): Promise<string> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error('Failed to fetch email body');
  const msg = await res.json();
  return extractHtmlFromPayload(msg.payload) ?? msg.snippet ?? '';
}

function decodeBase64Url(s: string): string {
  const base64 = s.replace(/-/g, '+').replace(/_/g, '/');
  try { return atob(base64); } catch { return ''; }
}

function extractHtmlFromPayload(payload: any): string | null {
  if (!payload) return null;
  if (payload.mimeType === 'text/html' && payload.body?.data)
    return decodeBase64Url(payload.body.data);
  for (const part of payload.parts ?? []) {
    const found = extractHtmlFromPayload(part);
    if (found) return found;
  }
  return null;
}

// Sender display name from "Name <email@domain.com>"
export function parseSender(from: string): string {
  const match = from.match(/^(.+?)\s*<.*>$/);
  return match ? match[1].replace(/"/g, '').trim() : from;
}
