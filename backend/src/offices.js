import { ISSUE_CATEGORIES } from './constants.js';
import { HttpError } from './errors.js';

export const publicOffice = office => office ? {
  _id: String(office._id), name: office.name, area: office.area || '',
  categories: office.categories, phone: office.phone || '', email: office.email || '',
  address: office.address || '', active: office.active,
} : null;

export async function initializeOffices(Office, Report) {
  for (const category of ISSUE_CATEGORIES) {
    const office = await Office.findOneAndUpdate({ key: category }, {
      $setOnInsert: { name: `${category} Desk`, categories: [category], area: 'Naga', active: true },
    }, { upsert: true, new: true, setDefaultsOnInsert: true });
    // Preserve existing reports and attach them to the appropriate default desk.
    await Report.updateMany({ ai_category: category, $or: [{ lgu_id: { $exists: false } }, { lgu_id: null }] }, { $set: { lgu_id: String(office._id) } });
  }
  // Keep old submissions accessible, but retire the former catch-all desk.
  const archived = await Office.findOneAndUpdate({ key: 'Unverified' }, { $set: { active: false, name: 'Archived reports' } }, { new: true });
  if (archived) await Report.updateMany({ ai_category: 'Unverified', $or: [{ lgu_id: { $exists: false } }, { lgu_id: null }] }, { $set: { lgu_id: String(archived._id) } });
  await Report.updateMany({ status: { $ne: 'Pending' }, acknowledgedAt: null }, [
    { $set: { acknowledgedAt: { $ifNull: ['$updatedAt', '$$NOW'] } } },
  ]);
}

export async function resolveOffice(Office, category, id) {
  if (id) {
    if (typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id)) throw new HttpError(400, 'Select a valid receiving office.');
    const office = await Office.findById(id).lean();
    if (!office?.active || !office.categories.includes(category)) throw new HttpError(400, 'Select an active office that handles this classification.');
    return office;
  }
  const offices = await Office.find({ active: true, categories: category }).lean();
  if (offices.length !== 1) throw new HttpError(400, 'Select the receiving LGU office for this issue.');
  return offices[0];
}

export async function enrichReports(Office, reports) {
  const ids = [...new Set(reports.map(report => report.lgu_id).filter(Boolean))];
  const offices = ids.length ? await Office.find({ _id: { $in: ids } }).lean() : [];
  const directory = new Map(offices.map(office => [String(office._id), publicOffice(office)]));
  return reports.map(value => {
    const report = typeof value.toObject === 'function' ? value.toObject() : value;
    return { ...report, image_urls: report.image_urls?.length ? report.image_urls : [report.image_url],
      lgu: directory.get(String(report.lgu_id)) || null,
      can_edit: report.status === 'Pending' && !report.acknowledgedAt };
  });
}

export function officeScope(account) {
  return account.role === 'admin' ? {} : { lgu_id: account.office_id, ai_category: { $in: account.categories } };
}
