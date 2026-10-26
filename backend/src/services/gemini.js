import { GoogleGenerativeAI } from '@google/generative-ai';
import { setTimeout as delay } from 'node:timers/promises';
import { AI_SYSTEM_PROMPT, ISSUE_CATEGORIES } from '../constants.js';
import { HttpError } from '../errors.js';

export function parseAnalysis(text) {
  let result;
  try { result = JSON.parse(text); } catch { throw new HttpError(502, 'AI returned an invalid response. Please retake the photo and try again.', 'AI_INVALID_RESPONSE'); }
  if (result?.is_valid_issue === false || result?.detected_category === 'Unverified') {
    throw new HttpError(422, 'This photo does not show a clear civic issue. Retake it with the issue clearly visible, or choose another picture.', 'INVALID_ISSUE_IMAGE');
  }
  if (!result || result.is_valid_issue !== true || !ISSUE_CATEGORIES.includes(result.detected_category) || typeof result.confidence_score !== 'number' || !Number.isFinite(result.confidence_score) || result.confidence_score < 0 || result.confidence_score > 1 || typeof result.user_confirmation_prompt !== 'string' || !result.user_confirmation_prompt.trim() || result.user_confirmation_prompt.length > 1000) {
    throw new HttpError(502, 'AI returned an invalid category or confidence. Please try again.', 'AI_INVALID_RESPONSE');
  }
  return {
    is_valid_issue: true,
    detected_category: result.detected_category,
    confidence_score: result.confidence_score,
    user_confirmation_prompt: result.user_confirmation_prompt,
  };
}

export function analysisError(error, modelName) {
  if (error instanceof HttpError) return error;
  if (error.status === 404) {
    const message = modelName.startsWith('gemini-1.5-')
      ? 'Gemini 1.5 Flash has been retired. Ask the administrator to configure an available image-capable model.'
      : 'The configured AI model is not available for this account. Ask the administrator to select an available Gemini model.';
    return new HttpError(503, message, 'AI_MODEL_UNAVAILABLE');
  }
  if (error.status === 429) return new HttpError(429, 'The Gemini request quota has been reached. Please wait before trying again; daily limits require waiting for the quota to reset.', 'AI_QUOTA_EXCEEDED');
  if (error.status === 503) return new HttpError(503, 'Google’s AI analysis is temporarily busy. Please try this photo again shortly.', 'AI_BUSY');
  if (error.status === 401 || error.status === 403) return new HttpError(503, 'AI service access was denied. Ask the administrator to check the Gemini API key and account permissions.', 'AI_ACCESS_DENIED');
  return new HttpError(502, 'AI analysis could not be completed. Please try again.', 'AI_UNAVAILABLE');
}

export async function generateWithRetry(generate, { wait = delay, now = Date.now, random = Math.random } = {}) {
  const started = now();
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    const remaining = 45_000 - (now() - started);
    if (remaining <= 0) throw lastError || new HttpError(503, 'AI analysis took too long. Please try this photo again.', 'AI_BUSY');
    try {
      return await generate({ timeout: Math.min(12_000, Math.max(1, remaining)) });
    } catch (error) {
      lastError = error;
      // Retry capacity/server failures only. Quota, access, invalid images and
      // malformed output need their own response rather than extra requests.
      if (![500, 503].includes(error.status) || attempt === 2) throw error;
      const pause = 1000 * 2 ** attempt + Math.floor(random() * 250);
      if (now() - started + pause >= 45_000) throw error;
      await wait(pause);
    }
  }
}

export function createAnalyzer(config) {
  const client = new GoogleGenerativeAI(config.geminiApiKey);
  const model = client.getGenerativeModel({
    model: config.geminiModel,
    systemInstruction: AI_SYSTEM_PROMPT,
    generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
  }, { timeout: 12_000 });
  return async (image) => {
    try {
      const parts = [
        { text: 'Classify the civic issue in this photo and return the required JSON object.' },
        { inlineData: image },
      ];
      const result = await generateWithRetry(options => model.generateContent(parts, options));
      return parseAnalysis(result.response.text());
    } catch (error) {
      throw analysisError(error, config.geminiModel);
    }
  };
}
