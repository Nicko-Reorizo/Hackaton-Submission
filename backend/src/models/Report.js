import mongoose from 'mongoose';
import { CATEGORIES, STATUSES } from '../constants.js';

const locationSchema = new mongoose.Schema({
  latitude: { type: Number, required: true, min: -90, max: 90 },
  longitude: { type: Number, required: true, min: -180, max: 180 },
}, { _id: false });

const reportSchema = new mongoose.Schema({
  reporter_uid: { type: String, required: true },
  image_url: { type: String, required: true },
  description: { type: String },
  ai_category: { type: String, required: true, enum: CATEGORIES },
  location: { type: locationSchema, required: true },
  status: { type: String, enum: STATUSES, default: 'Pending' },
  lgu_notes: { type: String },
}, { timestamps: true, versionKey: false });

reportSchema.index({ reporter_uid: 1, createdAt: -1 });
reportSchema.index({ createdAt: -1 });
// The same captured upload represents one submission, including response retries.
reportSchema.index({ reporter_uid: 1, image_url: 1 }, { unique: true });

export const Report = mongoose.models.Report || mongoose.model('Report', reportSchema);
