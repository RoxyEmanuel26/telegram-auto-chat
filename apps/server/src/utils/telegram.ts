/**
 * Centralized Telegram API URL normalization.
 * Ensures the URL always has https:// prefix and no trailing slash.
 */
let _cachedUrl: string | null = null;

export const getTelegramApiUrl = (): string => {
  if (_cachedUrl) return _cachedUrl;
  
  let url = process.env.TELEGRAM_API_URL || 'https://api.telegram.org';
  
  // Ensure protocol prefix
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }
  
  // Strip trailing slash
  if (url.endsWith('/')) {
    url = url.slice(0, -1);
  }
  
  _cachedUrl = url;
  return _cachedUrl;
};
