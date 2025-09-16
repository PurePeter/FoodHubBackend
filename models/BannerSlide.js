const mongoose = require("mongoose");

const BannerSlideSchema = new mongoose.Schema({
  imageName: {
    type: String,
    required: true,
  },
});

module.exports = mongoose.model("BannerSlide", BannerSlideSchema);
