const User = require('../models/User');
const Barbershop = require('../models/barbershop');
const bcrypt = require('bcryptjs');

const registerOwner = async (req, res) => {
  try {
    const { firstName, lastName, phone, email, password, barbershop } = req.body;
    const { name, description, category, location, logoUrl } = barbershop;

    if (!firstName || !lastName || !phone || !password || !name || !category || !location) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(400).json({ message: "Phone number already in use" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      firstName,
      lastName,
      phone,
      email,
      password: hashedPassword,
      role: 'owner',
      status: 'pending',
    });
    await newUser.save();

    const newBarbershop = new Barbershop({
      name,
      description,
      category,
      location,
      logoUrl,
      owner: newUser._id,
      status: 'pending',
    });
    await newBarbershop.save();

    return res.status(201).json({
      message: "Owner registered. Pending admin approval.",
      ownerId: newUser._id,
      barbershopId: newBarbershop._id
    });

  } catch (error) {
    console.error("Error registering owner:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = { registerOwner };
