import { CATEGORIES, STATUSES } from './constants.js';
import { HttpError } from './errors.js';
import { validatePhotoPath } from './photoPaths.js';

function objectBody(body) {
  if (!body || Array.isArray(body) || typeof body !== 'object') throw new HttpError(400, 'A JSON object is required.');
}

function optionalText(value, name, limit) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > limit) throw new HttpError(400, `${name} must be text of at most ${limit} characters.`);
  return value.trim();
}

export function validateImageUrl(value, config) {
  let url;
  try { url = new URL(value); } catch { throw new HttpError(400, 'image_url must be a valid HTTPS image URL.'); }
  if (typeof value !== 'string' || value.length > 4096 || url.protocol !== 'https:' || url.username || url.password || url.port || !config.imageAllowedHosts.has(url.hostname)) {
    throw new HttpError(400, 'image_url must use an allowed HTTPS image host.');
  }
  if (config.firebaseStorageBucket && ['firebasestorage.googleapis.com', 'storage.googleapis.com'].includes(url.hostname)) {
    let bucket;
    try {
      bucket = url.hostname === 'firebasestorage.googleapis.com'
        ? decodeURIComponent(url.pathname.match(/^\/v0\/b\/([^/]+)\/o\//)?.[1] || '')
        : decodeURIComponent(url.pathname.split('/')[1] || '');
    } catch { throw new HttpError(400, 'image_url has invalid URL encoding.'); }
    if (bucket !== config.firebaseStorageBucket) throw new HttpError(400, 'Image must belong to the configured Firebase Storage bucket.');
  }
  return url.toString();
}

export function validateOwnedImage(value, uid, config) {
  const image_url = validateImageUrl(value, config);
  const storageUrl = new URL(image_url);
  if (storageUrl.hostname === 'res.cloudinary.com') {
    const match = /^\/([^/]+)\/image\/upload\/v\d+\/(mynaga\/reports\/[a-f0-9]{64}\/[a-f0-9-]{36})\.jpg$/.exec(storageUrl.pathname);
    if (!config.cloudinaryCloudName || !match || match[1] !== config.cloudinaryCloudName || storageUrl.search || storageUrl.hash) {
      throw new HttpError(400, 'Use a photo uploaded to this project’s Cloudinary account.');
    }
    validatePhotoPath(match[2], uid);
  }
  if (['firebasestorage.googleapis.com', 'storage.googleapis.com'].includes(storageUrl.hostname)) {
    let objectPath;
    try {
      objectPath = storageUrl.hostname === 'firebasestorage.googleapis.com'
        ? decodeURIComponent(storageUrl.pathname.match(/^\/v0\/b\/[^/]+\/o\/(.+)$/)?.[1] || '')
        : decodeURIComponent(storageUrl.pathname.split('/').slice(2).join('/'));
    } catch { throw new HttpError(400, 'image_url has invalid URL encoding.'); }
    const segments = objectPath.split('/');
    if (segments[0] !== 'reports' || segments[1] !== uid || segments.length < 3 || !segments[2]) {
      throw new HttpError(403, 'Submit a photo uploaded to your own reports folder.');
    }
  }
  return image_url;
}

export function validateCreateReport(body, uid, config) {
  objectBody(body);
  if (body.reporter_uid !== uid) throw new HttpError(403, 'You may only submit reports for your own account.');
  const image_url = validateOwnedImage(body.image_url, uid, config);
  const photos = body.image_urls === undefined ? [image_url] : body.image_urls;
  if (!Array.isArray(photos) || photos.length < 1 || photos.length > 5 || photos[0] !== image_url || new Set(photos).size !== photos.length) throw new HttpError(400, 'Attach 1–5 distinct photos and keep the original photo first.');
  const image_urls = photos.map(value => validateOwnedImage(value, uid, config));
  if (body.ai_category === 'Unverified') throw new HttpError(422, 'A photo without a clear civic issue cannot be submitted. Take a clearer picture of the issue.', 'INVALID_ISSUE_IMAGE');
  if (!CATEGORIES.includes(body.ai_category)) throw new HttpError(400, 'ai_category must be one of the supported civic categories.');
  if (body.ai_suggested_category !== undefined && !CATEGORIES.includes(body.ai_suggested_category)) throw new HttpError(400, 'Invalid original AI classification.');
  const latitude = body.location?.latitude;
  const longitude = body.location?.longitude;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new HttpError(400, 'location requires numeric latitude (-90 to 90) and longitude (-180 to 180).');
  }
  const description = optionalText(body.description, 'description', 3000);
  // Explicit selection prevents citizens from setting status or LGU notes.
  return { reporter_uid: uid, image_url, image_urls, ...(description !== undefined ? { description } : {}), ai_category: body.ai_category,
    ai_suggested_category: body.ai_suggested_category || body.ai_category, location: { latitude, longitude } };
}

export function validateStatusUpdate(body) {
  objectBody(body);
  if (!STATUSES.includes(body.status)) throw new HttpError(400, 'status must be Pending, Acknowledged, In Progress, or Resolved.');
  const lgu_notes = optionalText(body.lgu_notes, 'lgu_notes', 5000);
  return { status: body.status, ...(lgu_notes !== undefined ? { lgu_notes } : {}) };
}

export function validateReportId(value) {
  if (!/^[a-f\d]{24}$/i.test(value)) throw new HttpError(400, 'Report ID must be a valid MongoDB ObjectId.');
  return value;
}
