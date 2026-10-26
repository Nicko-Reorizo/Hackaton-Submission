import { IMAGE_MIME_TYPES, MAX_IMAGE_BYTES } from '../constants.js';
import { HttpError } from '../errors.js';
import { validateImageUrl } from '../validation.js';

export function decodeBase64Image(value, mimeType) {
  if (typeof value !== 'string' || !value.length) throw new HttpError(400, 'image_base64 must be a nonempty base64 string.');
  const dataUri = /^data:(image\/[\w.+-]+);base64,([\s\S]+)$/.exec(value);
  const data = dataUri ? dataUri[2] : value;
  const mime = dataUri ? dataUri[1] : mimeType || 'image/jpeg';
  if (!IMAGE_MIME_TYPES.has(mime)) throw new HttpError(400, 'Supported image types are JPEG, PNG, and WebP.');
  // Check encoded length first; avoid repeated-group regexes over multi-MB input.
  if (data.length > 4 * Math.ceil(MAX_IMAGE_BYTES / 3)) throw new HttpError(413, 'Image must be at most 8 MB.');
  if (data.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(data)) throw new HttpError(400, 'image_base64 is malformed.');
  const buffer = Buffer.from(data, 'base64');
  if (!buffer.length) throw new HttpError(400, 'Image cannot be empty.');
  if (buffer.length > MAX_IMAGE_BYTES) throw new HttpError(413, 'Image must be at most 8 MB.');
  if (buffer.toString('base64') !== data) throw new HttpError(400, 'image_base64 is malformed.');
  return { mimeType: mime, data: buffer.toString('base64') };
}

export async function loadImage(body, config, fetchImage = fetch) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'A JSON object is required.');
  if (Boolean(body.image_url) === Boolean(body.image_base64)) throw new HttpError(400, 'Provide exactly one of image_url or image_base64.');
  if (body.image_base64) return decodeBase64Image(body.image_base64, body.mime_type);
  const url = validateImageUrl(body.image_url, config);
  let response;
  try {
    response = await fetchImage(url, { redirect: 'error', signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new HttpError(502, 'Could not download the uploaded image. Check its Storage URL and try again.');
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new HttpError(400, 'Image URL is not accessible. Upload the photo again.');
  }
  const mimeType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (!IMAGE_MIME_TYPES.has(mimeType)) {
    await response.body?.cancel();
    throw new HttpError(400, 'Image URL must return JPEG, PNG, or WebP.');
  }
  if (Number(response.headers.get('content-length')) > MAX_IMAGE_BYTES) {
    await response.body?.cancel();
    throw new HttpError(413, 'Image must be at most 8 MB.');
  }
  if (!response.body) throw new HttpError(400, 'Image URL returned an empty response.');
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > MAX_IMAGE_BYTES) throw new HttpError(413, 'Image must be at most 8 MB.');
      chunks.push(Buffer.from(chunk));
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, 'Image download was interrupted. Please try again.');
  }
  if (!size) throw new HttpError(400, 'Image cannot be empty.');
  return { mimeType, data: Buffer.concat(chunks).toString('base64') };
}
