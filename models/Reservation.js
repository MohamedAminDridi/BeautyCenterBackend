const mongoose = require("mongoose");

const reservationSchema = new mongoose.Schema({
  service: [
    { type: mongoose.Schema.Types.ObjectId, ref: "Service", required: function () { return !this.blocked; } },
  ],
  client: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: function () { return !this.blocked; } },
  personnel: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  barbershop: { type: mongoose.Schema.Types.ObjectId, ref: "Barbershop", required: true },
  date: { type: Date, required: true },
  endTime: { type: Date, required: true },
  status: {
    type: String,
    enum: ["pending", "confirmed", "cancelled"],
    default: "pending",
  },
  blocked: { type: Boolean, default: false },
  price: { type: Number, default: 0 }, // Added to store total price if calculated
}, {
  timestamps: true, // Adds createdAt and updatedAt fields
});

// Pre-save middleware to calculate endTime and price
reservationSchema.pre("save", async function (next) {
  if (!this.endTime) {
    const service = this.blocked ? null : await this.model("Service").findById(this.service[0]);
    const duration = service?.duration || 30; // Default to 30 minutes
    this.endTime = new Date(this.date.getTime() + duration * 60000);
  }

  // Calculate total price if services are provided
  if (!this.blocked && this.service.length > 0) {
    const services = await this.model("Service").find({ _id: { $in: this.service } });
    this.price = services.reduce((total, service) => total + (service.price || 0), 0);
  } else if (this.blocked) {
    this.price = 0; // No price for blocked slots
  }

  next();
});

// Index for performance
reservationSchema.index({ personnel: 1, date: 1, endTime: 1 });
reservationSchema.index({ client: 1, date: 1 });
reservationSchema.index({ barbershop: 1, date: 1 });

module.exports = mongoose.model("Reservation", reservationSchema);