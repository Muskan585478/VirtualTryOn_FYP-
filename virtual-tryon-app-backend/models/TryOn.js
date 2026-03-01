const mongoose = require("mongoose");

const tryOnSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  userImage: {
    type: String,
    required: true,
  },
  outfitImage: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("TryOn", tryOnSchema);
