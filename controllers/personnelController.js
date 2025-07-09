const registerPersonnel = async (req, res) => {
  try {
    const { firstName, lastName, phone, email, password, barbershopId, bio, profileImageUrl } = req.body;

    if (!firstName || !lastName || !phone || !password || !barbershopId) {
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
      role: 'personnel',
      status: 'pending',
      barbershop: barbershopId,
      profileImageUrl,
      bio
    });

    await newUser.save();

    res.status(201).json({
      message: "Personnel registered. Awaiting approval by barbershop owner.",
      userId: newUser._id
    });

  } catch (err) {
    console.error("Error registering personnel:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

module.exports = { registerPersonnel };
