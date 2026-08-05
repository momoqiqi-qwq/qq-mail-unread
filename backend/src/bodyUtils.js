'use strict';

const { simpleParser } = require('mailparser');

function normalizeBodyText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
}

function makeBodyPreview(text, config) {
  const normalized = normalizeBodyText(text);
  if (!normalized) {
    return {
      bodyPreview: '',
      bodyTextLength: 0,
      bodyPreviewLength: 0,
      bodyPreviewRatio: Number(config.bodyPreviewRatio || 0.6),
      bodyPreviewPercent: 0,
      bodyPreviewTruncated: false
    };
  }

  const rawRatio = Number(config.bodyPreviewRatio);
  const ratio = Number.isFinite(rawRatio) ? Math.min(1, Math.max(0.05, rawRatio)) : 0.6;
  const maxChars = Math.min(20000, Math.max(200, Number(config.maxBodyPreviewChars) || 3000));
  const ratioLength = Math.max(1, Math.ceil(normalized.length * ratio));
  const previewLength = Math.min(normalized.length, ratioLength, maxChars);
  const bodyPreview = normalized.slice(0, previewLength);

  return {
    bodyPreview,
    bodyTextLength: normalized.length,
    bodyPreviewLength: bodyPreview.length,
    bodyPreviewRatio: ratio,
    bodyPreviewPercent: normalized.length ? Math.round((bodyPreview.length / normalized.length) * 100) : 0,
    bodyPreviewTruncated: bodyPreview.length < normalized.length
  };
}

async function extractBodyPreviewFromSource(source, config) {
  if (!source) return makeBodyPreview('', config);

  const parsed = await simpleParser(source, {
    skipImageLinks: true,
    skipHtmlToText: false
  });

  const text = parsed.text || stripHtml(parsed.html || '');
  return makeBodyPreview(text, config);
}

module.exports = {
  normalizeBodyText,
  makeBodyPreview,
  extractBodyPreviewFromSource
};
