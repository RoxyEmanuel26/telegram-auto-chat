/**
 * Constructs the full URL for a bot avatar.
 * 
 * Handles three types of avatarUrl:
 * 1. Full URL (starts with http) - returned as-is
 * 2. Static cached file (/uploads/avatars/...) - prepend server base URL (without /api)
 * 3. Dynamic proxy (/bots/:id/avatar) - prepend API URL (with /api)
 */
export function getBotAvatarUrl(avatarUrl: string | null | undefined): string | null {
  if (!avatarUrl) return null;

  // Already a full URL
  if (avatarUrl.startsWith('http')) return avatarUrl;

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

  // Static file from /uploads/* — needs server base URL (strip /api suffix)
  if (avatarUrl.startsWith('/uploads/')) {
    const serverBase = apiUrl.replace(/\/api\/?$/, '');
    return `${serverBase}${avatarUrl}`;
  }

  // Dynamic proxy endpoint (/bots/:id/avatar) — needs /api prefix
  return `${apiUrl}${avatarUrl}`;
}
