const CODE_KEYWORDS = [
  '验证码', '校验码', '动态码', '安全码', '登录码', '登录验证', '一次性密码', '一次性验证码',
  '激活码', '激活链接', '激活', '登录', '登陆', '邀请码', '邀请代码', '注册码', '确认码', '确认代码',
  'verification code', 'verify code', 'security code', 'login code', 'one-time code', 'one time code',
  'otp', 'auth code', 'authentication code', 'activation code', 'activate', 'invite code', 'invitation code', 'registration code',
  'confirmation code', 'confirm code', 'passcode', '2fa', 'mfa'
];

const STRONG_CODE_PATTERNS = [
  /(?:验证码|校验码|动态码|安全码|登录码|登录验证码|一次性密码|一次性验证码|激活码|邀请码|注册码|确认码|确认代码|verification\s+code|security\s+code|login\s+code|one[-\s]?time\s+(?:code|password)|auth(?:entication)?\s+code|activation\s+code|invite\s+code|invitation\s+code|registration\s+code|confirmation\s+code|confirm\s+code|passcode|otp|2fa|mfa|code)\s*(?:is|为|是|:|：|=|#|：)?\s*([A-Z0-9][A-Z0-9\- ]{3,23}[A-Z0-9])/gi,
  /(?:您的|你的|本次|当前|登录|登陆|验证|确认|安全|动态|一次性|激活|邀请)[^\n\r]{0,16}?(?:码|密码)[^A-Za-z0-9\n\r]{0,8}([A-Z0-9][A-Z0-9\- ]{3,23}[A-Z0-9])/gi,
  /(?:is|为|是|:|：|=)\s*([A-Z0-9][A-Z0-9\- ]{3,23}[A-Z0-9])(?:\b|\s|。|，|,|\.|;|；)/gi
];

const WEAK_CODE_PATTERNS = [
  /\b([A-Z0-9]{4}-[A-Z0-9]{4}(?:-[A-Z0-9]{4}){0,3})\b/g,
  /\b(\d{4,8})\b/g,
  /\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{5,16}\b/gi
];

const COMMON_FALSE_POSITIVES = new Set([
  'QQ', 'MEGA', 'IMAP', 'SMTP', 'HTTP', 'HTTPS', 'LOGIN', 'EMAIL', 'MAIL', 'CODE', 'FROM', 'DATE', 'TIME',
  'MINUTE', 'MINUTES', 'EXPIRE', 'EXPIRES', 'EXPIRED', 'PRIVACY', 'TERMS', 'CONDITIONS'
]);

const FALSE_PHRASE_WORDS = [
  'expire', 'expires', 'expired', 'expiry', 'minute', 'minutes', 'hour', 'hours', 'valid', 'validity',
  'share', 'contact', 'privacy', 'terms', 'condition', 'conditions', 'anyone', 'never', 'will', 'sent',
  'review', 'protecting', 'contained', 'information', 'link', 'http', 'https', 'www'
];

export function buildSearchText(mail) {
  return [mail && mail.from, mail && mail.subject, mail && mail.bodyPreview].filter(Boolean).join(' ');
}

export function getMatchedCodeKeywords(mail) {
  const text = buildSearchText(mail).toLowerCase();
  return CODE_KEYWORDS.filter((keyword) => text.includes(keyword.toLowerCase()));
}

function normalizeCandidate(candidate) {
  return String(candidate || '')
    .trim()
    .replace(/^[#：:=\-\s]+/g, '')
    .replace(/[：:，,。.!！?？;；]+$/g, '')
    .replace(/\s+/g, '')
    .toUpperCase();
}

function looksLikeDateOrTime(value) {
  const v = String(value || '');
  if (/^20\d{2}$/.test(v)) return true;
  if (/^(0?[1-9]|1[0-2])(0?[1-9]|[12]\d|3[01])$/.test(v)) return true;
  if (/^(0?\d|1\d|2[0-3])([0-5]\d)$/.test(v)) return true;
  return false;
}

function hasFalsePhrase(raw, value) {
  const text = `${raw || ''} ${value || ''}`.toLowerCase();
  return FALSE_PHRASE_WORDS.some((word) => text.includes(word));
}

function isLikelyNaturalLanguage(raw, value) {
  const rawText = String(raw || '').trim();
  if (!rawText || rawText.indexOf(' ') === -1) return false;
  if (/[-_]/.test(rawText)) return false;
  const words = rawText.split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  const alphaWords = words.filter((word) => /^[a-z]+$/i.test(word));
  // 例如 “expires in 10 minutes” 这类自然语言短语不能当成验证码。
  return alphaWords.length >= 2 && /[0-9]/.test(value);
}

function isValidCandidate(raw, value) {
  if (!value) return false;
  if (value.length < 4 || value.length > 24) return false;
  if (!/[0-9]/.test(value)) return false;
  if (COMMON_FALSE_POSITIVES.has(value)) return false;
  if (looksLikeDateOrTime(value)) return false;
  if (hasFalsePhrase(raw, value)) return false;
  if (isLikelyNaturalLanguage(raw, value)) return false;
  return true;
}

function contextAround(text, index, length) {
  const start = Math.max(0, index - 70);
  const end = Math.min(text.length, index + length + 70);
  return text.slice(start, end).toLowerCase();
}

function scoreCandidate({ raw, value, index, strong, mail, text }) {
  let score = strong ? 120 : 20;
  const context = contextAround(text, index, String(raw || '').length);
  const subject = String(mail && mail.subject ? mail.subject : '').toLowerCase();

  if (CODE_KEYWORDS.some((keyword) => context.includes(keyword.toLowerCase()))) score += 70;
  if (CODE_KEYWORDS.some((keyword) => subject.includes(keyword.toLowerCase()))) score += 20;
  if (/(?:is|为|是|:|：|=|#)\s*$/i.test(text.slice(Math.max(0, index - 8), index))) score += 35;
  if (/^\d{6}$/.test(value)) score += 60;
  else if (/^\d{4,8}$/.test(value)) score += 40;
  else if (/^[A-Z0-9]{6,12}$/.test(value)) score += 25;
  else if (/^[A-Z0-9]{4}-[A-Z0-9]{4}/.test(value)) score += 30;
  if (hasFalsePhrase(raw, value)) score -= 200;
  if (!CODE_KEYWORDS.some((keyword) => context.includes(keyword.toLowerCase())) && value.length <= 4) score -= 35;
  return score;
}

function collectFromPatterns(mail) {
  const text = [mail && mail.subject, mail && mail.bodyPreview].filter(Boolean).join('\n');
  const byValue = new Map();

  function addCandidate(raw, index, strong) {
    const value = normalizeCandidate(raw);
    if (!isValidCandidate(raw, value)) return;
    const score = scoreCandidate({ raw, value, index, strong, mail, text });
    const existing = byValue.get(value);
    if (!existing || score > existing.score || (score === existing.score && index < existing.index)) {
      byValue.set(value, { value, raw: String(raw || ''), index, score });
    }
  }

  for (const pattern of STRONG_CODE_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const raw = match[1] || match[0];
      const rawOffset = match[0].lastIndexOf(raw);
      const index = match.index + (rawOffset >= 0 ? rawOffset : 0);
      addCandidate(raw, index, true);
    }
  }

  for (const pattern of WEAK_CODE_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const raw = match[1] || match[0];
      const rawOffset = match[0].lastIndexOf(raw);
      const index = match.index + (rawOffset >= 0 ? rawOffset : 0);
      addCandidate(raw, index, false);
    }
  }

  return [...byValue.values()].sort((a, b) => b.score - a.score || a.index - b.index);
}

export function extractCodeCandidates(mail) {
  return collectFromPatterns(mail).map((item) => item.value);
}

export function detectCodeMail(mail) {
  const matchedKeywords = getMatchedCodeKeywords(mail);
  const rankedCandidates = collectFromPatterns(mail);
  const codeCandidates = rankedCandidates.map((item) => item.value);
  return {
    isCodeMail: matchedKeywords.length > 0 || codeCandidates.length > 0,
    matchedKeywords,
    codeCandidates,
    primaryCode: codeCandidates[0] || '',
    codeConfidence: rankedCandidates[0] ? rankedCandidates[0].score : 0
  };
}

export function filterMailsByMode(mails, mode) {
  if (mode !== 'codes') return mails;
  return mails.filter((mail) => detectCodeMail(mail).isCodeMail);
}
