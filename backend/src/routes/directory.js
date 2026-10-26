import { Router } from 'express';
import { ISSUE_CATEGORIES } from '../constants.js';
import { authorizeLgu, requireAdministrator } from '../auth.js';
import { HttpError } from '../errors.js';
import { publicOffice } from '../offices.js';
import { validateReportId } from '../validation.js';

function text(value, name, limit, required = false) {
  if (typeof value !== 'string' || value.trim().length > limit || (required && !value.trim())) throw new HttpError(400, `${name} must be valid text (up to ${limit} characters).`);
  return value.trim();
}
function categories(value) {
  if (!Array.isArray(value) || !value.length || value.some(category => !ISSUE_CATEGORIES.includes(category))) throw new HttpError(400, 'Select at least one valid classification. Unclear photos cannot be assigned to an office.');
  return [...new Set(value)];
}
function officeInput(body) {
  const email = text(body.email || '', 'Email', 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid public email address.');
  if (body.active !== undefined && typeof body.active !== 'boolean') throw new HttpError(400, 'active must be true or false.');
  return { name: text(body.name, 'Office name', 120, true), area: text(body.area || '', 'Area', 120),
    categories: categories(body.categories), phone: text(body.phone || '', 'Phone', 80), email,
    address: text(body.address || '', 'Address', 300), active: body.active !== false };
}

export function createDirectoryRouter({ config, Office, Account, adminAuth }) {
  const router = Router();
  const official = authorizeLgu(config, Account, Office);
  router.get('/offices', async (_req, res) => res.json({ offices: (await Office.find({ active: true }).sort({ name: 1 }).lean()).map(publicOffice) }));
  router.get('/me', official, (req, res) => res.json({ account: { ...req.lgu, office: publicOffice(req.lgu.office) } }));
  router.use('/admin', official, requireAdministrator);
  router.get('/admin/offices', async (_req, res) => res.json({ offices: (await Office.find({}).sort({ name: 1 }).lean()).map(publicOffice) }));
  router.post('/admin/offices', async (req, res) => res.status(201).json({ office: publicOffice(await Office.create(officeInput(req.body || {}))) }));
  router.patch('/admin/offices/:id', async (req, res) => {
    const office = await Office.findByIdAndUpdate(validateReportId(req.params.id), { $set: officeInput(req.body || {}) }, { new: true, runValidators: true });
    if (!office) throw new HttpError(404, 'Office not found.');
    res.json({ office: publicOffice(office) });
  });
  router.get('/admin/accounts', async (_req, res) => res.json({ accounts: await Account.find({}).sort({ name: 1 }).lean() }));
  router.post('/admin/accounts', async (req, res) => {
    const body = req.body || {};
    const name = text(body.name, 'Staff name', 120, true);
    const office = await Office.findById(validateReportId(body.office_id || '')).lean();
    const selected = categories(body.categories);
    if (!office?.active || selected.some(category => !office.categories.includes(category))) throw new HttpError(400, 'Staff classifications must belong to the selected active office.');
    let user, created = false;
    try {
      if (body.uid) {
        user = await adminAuth.getUser(text(body.uid, 'Firebase UID', 128, true));
        if (user.disabled) throw new HttpError(400, 'This Firebase user is disabled. Enable the account before assigning an office.');
        if (!user.providerData.some(provider => provider.providerId === 'password')) throw new HttpError(400, 'The linked Firebase user must have email/password login.');
      } else {
        const email = text(body.email, 'Email', 200, true);
        if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) throw new HttpError(400, 'Choose a password of 8–128 characters.');
        user = await adminAuth.createUser({ email, password: body.password, displayName: name });
        created = true;
      }
      if (config.lguUids.has(user.uid)) throw new HttpError(400, 'The administrator account cannot be reassigned as staff.');
      if (await Account.findById(user.uid).lean()) throw new HttpError(409, 'This account already has an office assignment.');
      const account = await Account.create({ _id: user.uid, name, email: user.email, office_id: String(office._id), categories: selected });
      res.status(201).json({ account });
    } catch (error) {
      if (created && user) await adminAuth.deleteUser(user.uid).catch(() => undefined);
      if (error instanceof HttpError) throw error;
      throw new HttpError(400, 'The staff account could not be created. Check the email, UID, and whether the account already exists.');
    }
  });
  router.patch('/admin/accounts/:uid', async (req, res) => {
    const body = req.body || {};
    const office = await Office.findById(validateReportId(body.office_id || '')).lean();
    const selected = categories(body.categories);
    if (!office || selected.some(category => !office.categories.includes(category)) || typeof body.active !== 'boolean') throw new HttpError(400, 'Choose valid office classifications and account availability.');
    const account = await Account.findByIdAndUpdate(req.params.uid, { $set: { office_id: String(office._id), categories: selected, active: body.active } }, { new: true, runValidators: true });
    if (!account) throw new HttpError(404, 'Staff account not found.');
    res.json({ account });
  });
  return router;
}
