import mongoose from 'mongoose';
import { CATEGORIES, STATUSES } from '../constants.js';

const locationSchema = new mongoose.Schema({
  latitude: { type: Number, required: true, min: -90, max: 90 },
  longitude: { type: Number, required: true, min: -180, max: 180 },
}, { _id: false });

const reportSchema = new mongoose.Schema({
  reporter_uid: { type: String, required: true },
  image_url: { type: String, required: true },
  image_urls: { type: [String], default: undefined, validate: value => !value || (value.length >= 1 && value.length <= 5) },
  description: { type: String },
  ai_category: { type: String, required: true, enum: CATEGORIES },
  ai_suggested_category: { type: String, enum: CATEGORIES },
  lgu_id: { type: String, index: true },
  acknowledgedAt: { type: Date },
  location: { type: locationSchema, required: true },
  status: { type: String, enum: STATUSES, default: 'Pending' },
  lgu_notes: { type: String },
}, { timestamps: true, versionKey: false });

reportSchema.index({ reporter_uid: 1, createdAt: -1 });
reportSchema.index({ createdAt: -1 });
reportSchema.index({ lgu_id: 1, status: 1, createdAt: -1 });
// The same captured upload represents one submission, including response retries.
reportSchema.index({ reporter_uid: 1, image_url: 1 }, { unique: true });

export const Report = mongoose.models.Report || mongoose.model('Report', reportSchema);
