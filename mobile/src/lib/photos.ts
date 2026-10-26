import type { User } from 'firebase/auth';
import { request } from './api';

// Firebase authenticates the citizen; the server uploads to Cloudinary using
// credentials that are never embedded in the mobile application.
export async function uploadPhoto(user: User, base64: string) {
  const photo = await request<{ path: string; url: string }>(user, '/api/reports/photo', {
    image_base64: base64,
    mime_type: 'image/jpeg',
  });
  if (!photo.path || !photo.url?.startsWith('https://res.cloudinary.com/')) {
    throw new Error('Photo storage returned an invalid response. Please try again.');
  }
  return photo;
}

export async function removeUnsubmittedPhoto(user: User, path: string) {
  await request<void>(user, '/api/reports/photo', { path }, 'DELETE').catch(() => undefined);
}
