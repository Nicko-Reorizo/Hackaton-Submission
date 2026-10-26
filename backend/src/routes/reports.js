import { Router } from 'express';
import { requireCitizen, requireLgu } from '../auth.js';
import { HttpError } from '../errors.js';
import { decodeBase64Image, loadImage } from '../services/image.js';
import { validatePhotoPath } from '../photoPaths.js';
import { validateCreateReport, validateReportId, validateStatusUpdate } from '../validation.js';

export function createReportRouter({ Report, analyzeImage, photoStorage, config }) {
  const router = Router();

  router.post('/photo', requireCitizen, async (req, res) => {
    if (!photoStorage) throw new HttpError(503, 'Photo storage is not configured.');
    const image = decodeBase64Image(req.body?.image_base64, req.body?.mime_type);
    if (image.mimeType !== 'image/jpeg') throw new HttpError(400, 'Report photos must be JPEG images.');
    res.status(201).json(await photoStorage.upload(req.user.uid, image));
  });

  router.delete('/photo', requireCitizen, async (req, res) => {
    const path = validatePhotoPath(req.body?.path, req.user.uid);
    if (!photoStorage) throw new HttpError(503, 'Photo storage is not configured.');
    // Retakes must not remove a photo already attached to a committed report.
    const suffix = `/${path}.jpg`;
    const escaped = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const used = await Report.exists({ reporter_uid: req.user.uid, image_url: { $regex: `${escaped}$` } });
    if (!used) await photoStorage.remove(req.user.uid, path);
    res.status(204).end();
  });

  router.post('/analyze', requireCitizen, async (req, res) => {
    const image = await loadImage(req.body, config);
    res.json(await analyzeImage(image));
  });

  router.post('/', requireCitizen, async (req, res) => {
    const payload = validateCreateReport(req.body, req.user.uid, config);
    try {
      const report = await Report.create(payload);
      res.status(201).json({ report });
    } catch (error) {
      if (error.code !== 11000) throw error;
      // A prior request may have committed while its response was lost. The
      // unique index makes concurrent retries safe, without changing that report.
      const report = await Report.findOne({ reporter_uid: req.user.uid, image_url: payload.image_url });
      if (!report) throw error;
      res.status(200).json({ report });
    }
  });

  router.get('/my-reports/:uid', requireCitizen, async (req, res) => {
    if (req.params.uid !== req.user.uid) throw new HttpError(403, 'You may only view your own reports.');
    const reports = await Report.find({ reporter_uid: req.user.uid }).sort({ createdAt: -1 }).lean();
    res.json({ reports });
  });

  router.get('/lgu', requireLgu(config.lguUids), async (_req, res) => {
    const reports = await Report.find({}).sort({ createdAt: -1 }).lean();
    res.json({ reports });
  });

  router.patch('/:id/status', requireLgu(config.lguUids), async (req, res) => {
    const id = validateReportId(req.params.id);
    const changes = validateStatusUpdate(req.body);
    const report = await Report.findByIdAndUpdate(id, { $set: changes }, { new: true, runValidators: true });
    if (!report) throw new HttpError(404, 'Report was not found.');
    res.json({ report });
  });

  return router;
}
