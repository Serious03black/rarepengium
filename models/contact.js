const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Name is required"],
    trim: true
  },
  location: {
    type: String,
    required:false,
    trim: true
  },

  email: {
    type: String,
    required: [true, "Email is required"],
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, "Please provide a valid email address"]
  },

  phone: {
    type: String,
    required: [true, "Phone is required"],
    trim: true,
    minlength: [10, "Phone must be exactly 10 digits"],
    maxlength: [10, "Phone must be exactly 10 digits"],
    match: [/^\d{10}$/, "Phone must contain only 10 digits (no spaces or dashes)"]
  },

  subject: {
    type: String,
    required: [true, "Subject/Service is required"],
    enum: [
      "Fashion Shoot",
      "Brand Campaign",
      "Product Photography",
      "Video Production",
      "Other"
    ],
    trim: true
  },

  budget: {  // renamed from "budjet" to correct spelling
    type: String,
    trim: true,
    default: null  // optional – will not be saved if empty
  },

  membership: {
    type: String,
    trim: true,
    default: null  // optional (e.g., "GAP Me" field)
  },

  website: {
    type: String,
    trim: true,
    default: null,  // optional
  },

  message: {
    type: String,
    trim: true
  },

  isPartial: {
    type: Boolean,
    default: false
  },

  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true
  }
});

module.exports = mongoose.model("Contact", contactSchema);