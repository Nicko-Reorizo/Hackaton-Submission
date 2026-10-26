import { Router } from 'express';
import { Types } from 'mongoose';
import { authorizeLgu, requireCitizen } from '../auth.js';
import { CATEGORIES, STATUSES } from '../constants.js';
import { HttpError } from '../errors.js';
import { decodeBase64Image, loadImage } from '../services/image.js';
import { validatePhotoPath } from '../photoPaths.js';
import { validateCreateReport, validateReportId, validateStatusUpdate } from '../validation.js';
import { enrichReports, officeScope, resolveOffice } from '../offices.js';

const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function createReportRouter({ Report, Office, Account, analyzeImage, photoStorage, config }) {
  const router = Router();
  const official = authorizeLgu(config, Account, Office);
  const enrich = async value => (await enrichReports(Office, [value]))[0];

  async function removePhoto(uid, path) {
    const expression = `${escapeRegex(`/${path}.jpg`)}$`;
    const used = await Report.exists({ $or: [{ image_url: { $regex: expression } }, { image_urls: { $regex: expression } }] });
    if (!used) await photoStorage.remove(uid, path);
  }
  async function cleanup(uid, urls) {
    if (!photoStorage) return;
    await Promise.allSettled(urls.filter(url => url.startsWith('https://res.cloudinary.com/')).map(async url => {
      const path = new URL(url).pathname.match(/\/v\d+\/(mynaga\/reports\/.+)\.jpg$/)?.[1];
      if (path) { validatePhotoPath(path, uid); await removePhoto(uid, path); }
    }));
  }

  router.post('/photo', requireCitizen, async (req, res) => {
    if (!photoStorage) throw new HttpError(503, 'Photo storage is not configured.');
    const image = decodeBase64Image(req.body?.image_base64, req.body?.mime_type);
    if (image.mimeType !== 'image/jpeg') throw new HttpError(400, 'Report photos must be JPEG images.');
    res.status(201).json(await photoStorage.upload(req.user.uid, image));
  });
  router.delete('/photo', requireCitizen, async (req, res) => {
    const path = validatePhotoPath(req.body?.path, req.user.uid);
    if (!photoStorage) throw new HttpError(503, 'Photo storage is not configured.');
    await removePhoto(req.user.uid, path);
    res.status(204).end();
  });
  router.post('/analyze', requireCitizen, async (req, res) => res.json(await analyzeImage(await loadImage(req.body, config))));

  router.post('/', requireCitizen, async (req, res) => {
    const payload = validateCreateReport(req.body, req.user.uid, config);
    const office = await resolveOffice(Office, payload.ai_category, req.body.lgu_id);
    payload.lgu_id = String(office._id);
    try {
      const report = await Report.create(payload);
      res.status(201).json({ report: await enrich(report) });
    } catch (error) {
      if (error.code !== 11000) throw error;
      const report = await Report.findOne({ reporter_uid: req.user.uid, image_url: payload.image_url });
      if (!report) throw error;
      res.json({ report: await enrich(report) });
    }
  });
  router.get('/my-reports/:uid', requireCitizen, async (req, res) => {
    if (req.params.uid !== req.user.uid) throw new HttpError(403, 'You may only view your own reports.');
    const reports = await Report.find({ reporter_uid: req.user.uid }).sort({ createdAt: -1 }).lean();
    res.json({ reports: await enrichReports(Office, reports) });
  });

  router.get('/lgu', official, async (req, res) => {
    const page = Number(req.query.page || 1), pageSize = Number(req.query.page_size || 25);
    if (!Number.isInteger(page) || page < 1 || page > 100000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new HttpError(400, 'Use a valid page and page size (1–100).');
    const conditions = [officeScope(req.lgu)];
    if (req.query.office_id) {
      if (req.lgu.role !== 'admin' && req.query.office_id !== req.lgu.office_id) throw new HttpError(403, 'You may only access your assigned office.');
      conditions.push({ lgu_id: validateReportId(req.query.office_id) });
    }
    if (req.query.category) {
      if (!CATEGORIES.includes(req.query.category)) throw new HttpError(400, 'Invalid classification filter.');
      conditions.push({ ai_category: req.query.category });
    }
    if (req.query.q) {
      if (typeof req.query.q !== 'string' || req.query.q.length > 120) throw new HttpError(400, 'Search must be at most 120 characters.');
      const expression = escapeRegex(req.query.q.trim());
      const searches = [{ description: { $regex: expression, $options: 'i' } }, { ai_category: { $regex: expression, $options: 'i' } }, { lgu_notes: { $regex: expression, $options: 'i' } }];
      if (/^[a-f\d]{24}$/i.test(req.query.q)) searches.push({ _id: new Types.ObjectId(req.query.q) });
      conditions.push({ $or: searches });
    }
    const countFilter = { $and: [...conditions] };
    if (req.query.status) {
      if (!STATUSES.includes(req.query.status)) throw new HttpError(400, 'Invalid status filter.');
      conditions.push({ status: req.query.status });
    }
    const filter = { $and: conditions };
    const [reports, total, grouped] = await Promise.all([
      Report.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
      Report.countDocuments(filter), Report.aggregate([{ $match: countFilter }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    ]);
    const counts = Object.fromEntries(STATUSES.map(status => [status, 0]));
    for (const group of grouped) counts[group._id] = group.count;
    res.json({ reports: await enrichReports(Office, reports), counts,
      pagination: { page, page_size: pageSize, total, total_pages: Math.max(1, Math.ceil(total / pageSize)) } });
  });

  router.patch('/:id/status', official, async (req, res) => {
    const id = validateReportId(req.params.id), changes = validateStatusUpdate(req.body);
    const query = { _id: id, ...officeScope(req.lgu) };
    const current = await Report.findOne(query).lean();
    if (!current) throw new HttpError(404, 'Report not found in your assigned queue.');
    if (changes.status !== 'Pending' && !current.acknowledgedAt) changes.acknowledgedAt = new Date();
    if (current.status !== 'Pending' && !current.acknowledgedAt) changes.acknowledgedAt = current.updatedAt || new Date();
    const report = await Report.findOneAndUpdate({ ...query, updatedAt: current.updatedAt }, { $set: changes }, { new: true, runValidators: true });
    if (!report) throw new HttpError(409, 'This report changed while you were reviewing it. Refresh and try again.');
    res.json({ report: await enrich(report) });
  });

  router.patch('/:id', requireCitizen, async (req, res) => {
    const id = validateReportId(req.params.id);
    const current = await Report.findOne({ _id: id, reporter_uid: req.user.uid }).lean();
    if (!current) throw new HttpError(404, 'Report not found.');
    if (current.status !== 'Pending' || current.acknowledgedAt) throw new HttpError(409, 'This report has been acknowledged and can no longer be edited or deleted.');
    const body = req.body || {};
    const payload = validateCreateReport({ reporter_uid: req.user.uid, image_url: current.image_url,
      image_urls: body.image_urls ?? current.image_urls ?? [current.image_url],
      description: body.description ?? current.description, ai_category: body.ai_category ?? current.ai_category,
      ai_suggested_category: current.ai_suggested_category || current.ai_category, location: current.location }, req.user.uid, config);
    const office = await resolveOffice(Office, payload.ai_category, body.lgu_id || (payload.ai_category === current.ai_category ? current.lgu_id : undefined));
    const report = await Report.findOneAndUpdate({ _id: id, reporter_uid: req.user.uid, status: 'Pending', acknowledgedAt: null, updatedAt: current.updatedAt },
      { $set: { description: payload.description || '', ai_category: payload.ai_category, image_urls: payload.image_urls, lgu_id: String(office._id) } }, { new: true, runValidators: true });
    if (!report) throw new HttpError(409, 'The LGU acknowledged or updated this report. Refresh your reports before continuing.');
    const removed = (current.image_urls || [current.image_url]).filter(url => !payload.image_urls.includes(url));
    void cleanup(req.user.uid, removed);
    res.json({ report: await enrich(report) });
  });

  router.delete('/:id', requireCitizen, async (req, res) => {
    const report = await Report.findOneAndDelete({ _id: validateReportId(req.params.id), reporter_uid: req.user.uid, status: 'Pending', acknowledgedAt: null });
    if (!report) {
      const exists = await Report.exists({ _id: req.params.id, reporter_uid: req.user.uid });
      throw new HttpError(exists ? 409 : 404, exists ? 'This report has been acknowledged and can no longer be deleted.' : 'Report not found.');
    }
    void cleanup(req.user.uid, report.image_urls || [report.image_url]);
    res.status(204).end();
  });
  return router;
}
