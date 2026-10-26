import { GoogleGenerativeAI } from '@google/generative-ai';
import { AI_SYSTEM_PROMPT, CATEGORIES } from '../constants.js';
import { HttpError } from '../errors.js';

export function parseAnalysis(text) {
  let result;
  try { result = JSON.parse(text); } catch { throw new HttpError(502, 'AI returned an invalid response. Please retake the photo and try again.', 'AI_INVALID_RESPONSE'); }
  if (!result || !CATEGORIES.includes(result.detected_category) || typeof result.confidence_score !== 'number' || !Number.isFinite(result.confidence_score) || result.confidence_score < 0 || result.confidence_score > 1 || typeof result.user_confirmation_prompt !== 'string' || !result.user_confirmation_prompt.trim() || result.user_confirmation_prompt.length > 1000) {
    throw new HttpError(502, 'AI returned an invalid category or confidence. Please try again.', 'AI_INVALID_RESPONSE');
  }
  return {
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
  if (error.status === 429) return new HttpError(503, 'AI analysis is busy or its quota has been reached. Please try again later.', 'AI_UNAVAILABLE');
  if (error.status === 503) return new HttpError(503, 'AI analysis is temporarily busy. Please try again shortly.', 'AI_UNAVAILABLE');
  if (error.status === 401 || error.status === 403) return new HttpError(503, 'AI service access was denied. Ask the administrator to check the Gemini API key and account permissions.', 'AI_ACCESS_DENIED');
  return new HttpError(502, 'AI analysis could not be completed. Please try again.', 'AI_UNAVAILABLE');
}

export function createAnalyzer(config) {
  const client = new GoogleGenerativeAI(config.geminiApiKey);
  const model = client.getGenerativeModel({
    model: config.geminiModel,
    systemInstruction: AI_SYSTEM_PROMPT,
    generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
  }, { timeout: 30_000 });
  return async (image) => {
    try {
      const result = await model.generateContent([
        { text: 'Classify the civic issue in this photo and return the required JSON object.' },
        { inlineData: image },
      ]);
      return parseAnalysis(result.response.text());
    } catch (error) {
      throw analysisError(error, config.geminiModel);
    }
  };
}
