import { createHash, randomUUID } from 'node:crypto';
import { HttpError } from '../errors.js';
import { photoPrefix, validatePhotoPath } from '../photoPaths.js';

// Cloudinary's signed Upload API keeps the API secret exclusively on the server.
export function createPhotoStorage(config, fetchCloudinary = fetch) {
  async function call(action, parameters) {
    if (!config.cloudinaryCloudName || !config.cloudinaryApiKey || !config.cloudinaryApiSecret) {
      throw new HttpError(503, 'Photo storage is not configured. Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET to backend/.env.');
    }
    const fields = { ...parameters, timestamp: String(Math.floor(Date.now() / 1000)) };
    const signed = Object.entries(fields).filter(([key]) => key !== 'file').sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('&');
    const signature = createHash('sha256').update(signed + config.cloudinaryApiSecret).digest('hex');
    let response;
    try {
      response = await fetchCloudinary(`https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudinaryCloudName)}/image/${action}`, {
        method: 'POST',
        body: new URLSearchParams({ ...fields, api_key: config.cloudinaryApiKey, signature }),
        signal: AbortSignal.timeout(40_000),
        redirect: 'error',
      });
    } catch {
      throw new HttpError(502, 'Could not reach photo storage. Check your connection and try again.');
    }
    const result = await response.json().catch(() => null);
    if (!response.ok || !result || result.error) {
      throw new HttpError(502, 'Photo storage could not complete the request. Check the Cloudinary credentials and free-plan usage, then try again.');
    }
    return result;
  }

  return {
    async upload(uid, image) {
      const path = `${photoPrefix(uid)}${randomUUID()}`;
      const result = await call('upload', {
        file: `data:${image.mimeType};base64,${image.data}`,
        public_id: path,
        overwrite: 'false',
        format: 'jpg',
      });
      const expected = `https://res.cloudinary.com/${config.cloudinaryCloudName}/image/upload/v${result.version}/${path}.jpg`;
      if (result.public_id !== path || result.secure_url !== expected || !Number.isSafeInteger(result.version)) {
        throw new HttpError(502, 'Photo storage returned an unexpected response. Please try again.');
      }
      return { path, url: result.secure_url };
    },
    async remove(uid, path) {
      validatePhotoPath(path, uid);
      const result = await call('destroy', { public_id: path, invalidate: 'true' });
      if (!['ok', 'not found'].includes(result.result)) throw new HttpError(502, 'Photo could not be removed.');
    },
  };
}
