import 'dotenv/config';

const csv = (value) => (value || '').split(',').map((item) => item.trim()).filter(Boolean);

export function readConfig(env = process.env) {
  const port = Number(env.PORT || 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port.');
  return {
    port,
    host: env.HOST || '0.0.0.0',
    mongoUri: env.MONGODB_URI,
    corsOrigins: csv(env.CORS_ORIGINS || 'http://localhost:5173'),
    firebaseProjectId: env.FIREBASE_PROJECT_ID,
    firebaseClientEmail: env.FIREBASE_CLIENT_EMAIL,
    firebasePrivateKey: env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    firebaseStorageBucket: env.FIREBASE_STORAGE_BUCKET || undefined,
    cloudinaryCloudName: env.CLOUDINARY_CLOUD_NAME,
    cloudinaryApiKey: env.CLOUDINARY_API_KEY,
    cloudinaryApiSecret: env.CLOUDINARY_API_SECRET,
    lguUids: new Set(csv(env.LGU_ALLOWED_UIDS)),
    geminiApiKey: env.GEMINI_API_KEY,
    geminiModel: env.GEMINI_MODEL?.trim() || 'gemini-3.1-flash-lite',
    imageAllowedHosts: new Set(['res.cloudinary.com', ...csv(env.IMAGE_ALLOWED_HOSTS || 'firebasestorage.googleapis.com,storage.googleapis.com').map((host) => host.toLowerCase())]),
  };
}

export function assertStartupConfig(config) {
  const missing = [
    ['MONGODB_URI', config.mongoUri],
    ['FIREBASE_PROJECT_ID', config.firebaseProjectId],
    ['GEMINI_API_KEY', config.geminiApiKey],
    ['CLOUDINARY_CLOUD_NAME', config.cloudinaryCloudName],
    ['CLOUDINARY_API_KEY', config.cloudinaryApiKey],
    ['CLOUDINARY_API_SECRET', config.cloudinaryApiSecret],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) throw new Error(`Missing environment settings: ${missing.join(', ')}. Copy backend/.env.example to backend/.env and configure it.`);
  if (Boolean(config.firebaseClientEmail) !== Boolean(config.firebasePrivateKey)) {
    throw new Error('Set both FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY, or use application default credentials.');
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(config.cloudinaryCloudName)) throw new Error('CLOUDINARY_CLOUD_NAME must be the Cloud name shown in your Cloudinary account.');
}
