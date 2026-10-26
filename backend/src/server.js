import mongoose from 'mongoose';
import { createApp } from './app.js';
import { assertStartupConfig, readConfig } from './config.js';
import { createTokenVerifier } from './auth.js';
import { Report } from './models/Report.js';
import { createAnalyzer } from './services/gemini.js';
import { createPhotoStorage } from './services/cloudinary.js';

async function main() {
  const config = readConfig();
  assertStartupConfig(config);
  const verifyToken = createTokenVerifier(config);
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10_000 });
  // Wait for the unique submission index before accepting response retries.
  await Report.init();
  const app = createApp({ config, Report, verifyToken, analyzeImage: createAnalyzer(config), photoStorage: createPhotoStorage(config) });
  const server = app.listen(config.port, config.host, () => {
    console.log(`MyNaga API listening on port ${config.port}`);
    if (config.geminiModel.startsWith('gemini-1.5-')) console.warn('Gemini 1.5 is retired. Set GEMINI_MODEL to an available image-capable model before analyzing photos.');
  });
  server.on('error', (error) => {
    console.error('HTTP server failed:', error.code || error.name);
    mongoose.disconnect().finally(() => process.exit(1));
  });
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    const timer = setTimeout(() => process.exit(1), 10_000);
    timer.unref();
    server.close(() => mongoose.disconnect().finally(() => process.exit(0)));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  // Connection strings may contain passwords, so do not print raw driver errors.
  console.error(error.name === 'MongooseServerSelectionError'
    ? 'Cannot connect to MongoDB. Check MONGODB_URI, MongoDB availability, and Atlas network access.'
    : error.name === 'Error' ? error.message : `Startup failed (${error.name}). Check backend configuration.`);
  process.exitCode = 1;
});
