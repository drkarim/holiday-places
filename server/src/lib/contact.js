// Pull a phone number and a website out of free text such as
// "WhatsApp / phone +1 246 826 4420; https://www.mimosasbarbados.com"
const PHONE_RE = /(\+?\d[\d\s().-]{6,}\d)/;
const URL_RE = /(https?:\/\/[^\s,;]+)/i;
const BARE_DOMAIN_RE = /\b([a-z0-9-]+\.(?:com|org|net|co|io|bb|travel|info)(?:\/[^\s,;]*)?)\b/i;

export function extractPhone(text) {
  if (!text) return null;
  const match = String(text).match(PHONE_RE);
  return match ? match[1].trim() : null;
}

export function extractWebsite(text) {
  if (!text) return null;
  const urlMatch = String(text).match(URL_RE);
  if (urlMatch) return urlMatch[1].replace(/[).,;]+$/, '');
  const domainMatch = String(text).match(BARE_DOMAIN_RE);
  if (domainMatch) return `https://${domainMatch[1].replace(/[).,;]+$/, '')}`;
  return null;
}

export function telHref(phone) {
  if (!phone) return null;
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}
