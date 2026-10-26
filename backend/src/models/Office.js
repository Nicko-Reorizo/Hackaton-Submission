import mongoose from 'mongoose';
import { CATEGORIES } from '../constants.js';

const schema = new mongoose.Schema({
  key: { type: String, unique: true, sparse: true },
  name: { type: String, required: true, maxlength: 120 },
  area: { type: String, default: '', maxlength: 120 },
  categories: [{ type: String, enum: CATEGORIES }],
  phone: { type: String, default: '', maxlength: 80 },
  email: { type: String, default: '', maxlength: 200 },
  address: { type: String, default: '', maxlength: 300 },
  active: { type: Boolean, default: true },
}, { timestamps: true, versionKey: false });
export const Office = mongoose.models.Office || mongoose.model('Office', schema);

const accountSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // Firebase UID; passwords stay in Firebase.
  name: { type: String, required: true },
  email: { type: String, required: true },
  office_id: { type: String, required: true },
  categories: [{ type: String, enum: CATEGORIES }],
  active: { type: Boolean, default: true },
}, { timestamps: true, versionKey: false });
export const Account = mongoose.models.LguAccount || mongoose.model('LguAccount', accountSchema);
