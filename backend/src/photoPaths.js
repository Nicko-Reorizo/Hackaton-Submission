import { createHash } from 'node:crypto';
import { HttpError } from './errors.js';

export function photoPrefix(uid) {
  return `mynaga/reports/${createHash('sha256').update(uid).digest('hex')}/`;
}

export function validatePhotoPath(path, uid) {
  if (typeof path !== 'string' || !path.startsWith(photoPrefix(uid)) || !/^[a-f0-9-]{36}$/.test(path.slice(photoPrefix(uid).length))) {
    throw new HttpError(403, 'You may only access your own uploaded photos.');
  }
  return path;
}
