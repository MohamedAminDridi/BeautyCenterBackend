const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Barbershop = require('../models/barbershop');
const PersonnelApplication = require('../models/PersonnelApplication');
const { registerPersonnel } = require('../controllers/personnelController');

// REGISTER USER
const registerUser = async (req, res) => {
  const { firstName, lastName, phone, email, password, role, barbershopInfo, servicesOffered, bio } = req.body;
  const file = req.file; // Profile image or logo
  const documents = req.files?.documents || []; // For barbershop documents

  if (!firstName || !lastName || !phone || !email || !password) {
    return res.status(400).json({ message: 'All required fields must be provided' });
  }

  try {
    const existingUser = await User.findOne({ $or: [{ phone }, { email }] });
    if (existingUser) {
      return res.status(400).json({ message: 'Phone or email already in use' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const status = role === 'owner' || role === 'personnel' ? 'pending' : 'approved';

    const newUser = new User({
      firstName,
      lastName,
      phone,
      email,
      password: hashedPassword,
      role: role || 'client',
      profileImageUrl: file ? file.path : null,
      status,
    });

    await newUser.save();

    if (role === 'owner' && barbershopInfo) {
let barbershopData = typeof barbershopInfo === 'string' ? JSON.parse(barbershopInfo) : barbershopInfo;
const { name, description, address, latitude, longitude, category } = barbershopData;
      if (!name || !address || !latitude || !longitude || !category) {
        return res.status(400).json({ message: 'All barbershop fields are required' });
      }

      const newBarbershop = new Barbershop({
        name,
        description,
        category,
        location: { address, coordinates: { latitude, longitude } },
        logoUrl: file ? file.path : null,
        documents: documents.map(doc => doc.path),
        owner: newUser._id,
        status: 'pending',
      });

      await newBarbershop.save();
      // TODO: Notify admin (e.g., via email or push notification)
    }

    if (role === 'personnel' && barbershopInfo?.barbershopId) {
      const barbershop = await Barbershop.findById(barbershopInfo.barbershopId);
      if (!barbershop) {
        return res.status(400).json({ message: 'Barbershop not found' });
      }

      const application = new PersonnelApplication({
        personnel: newUser._id,
        barbershop: barbershop._id,
        bio,
        servicesOffered,
        photoUrl: file ? file.path : null,
        status: 'pending',
      });

      await application.save();
      newUser.barbershop = barbershop._id;
      await newUser.save();
      // TODO: Notify barbershop owner
    }

    const token = jwt.sign(
      { id: newUser._id, role: newUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.status(201).json({
      message: 'Registration successful, awaiting approval if applicable',
      token,
      user: {
        _id: newUser._id,
        phone: newUser.phone,
        email: newUser.email,
        role: newUser.role,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        profileImageUrl: newUser.profileImageUrl,
        isActive: newUser.isActive,
        status: newUser.status,
      },
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// LOGIN USER
const loginUser = async (req, res) => {
  const { phone, password } = req.body;

  if (!phone || !password) {
    return res.status(400).json({ message: 'Phone and password are required' });
  }

  try {
    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    if (user.status === 'pending') {
      return res.status(403).json({ message: 'Account is pending approval' });
    }

    if (user.status === 'rejected') {
      return res.status(403).json({ message: 'Account was rejected' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        _id: user._id,
        phone: user.phone,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        profileImageUrl: user.profileImageUrl,
        isActive: user.isActive,
        status: user.status,
      },
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ADMIN APPROVE/REJECT BARBERSHOP
const approveBarbershop = async (req, res) => {
  const { barbershopId, action } = req.body; // action: 'approve' or 'reject'
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }

  try {
    const barbershop = await Barbershop.findById(barbershopId);
    if (!barbershop) {
      return res.status(404).json({ message: 'Barbershop not found' });
    }

    barbershop.status = action === 'approve' ? 'approved' : 'rejected';
    await barbershop.save();

    const owner = await User.findById(barbershop.owner);
    if (owner) {
      owner.status = action === 'approve' ? 'approved' : 'rejected';
      await owner.save();
      // TODO: Notify owner
    }

    res.status(200).json({ message: `Barbershop ${action}d successfully` });
  } catch (err) {
    console.error('Approval error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// OWNER APPROVE/REJECT PERSONNEL
const approvePersonnel = async (req, res) => {
  const { applicationId, action } = req.body; // action: 'approve' or 'reject'
  if (req.user.role !== 'owner') {
    return res.status(403).json({ message: 'Owner access required' });
  }

  try {
    const application = await PersonnelApplication.findById(applicationId).populate('barbershop');
    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    if (application.barbershop.owner.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to manage this application' });
    }

    application.status = action === 'approve' ? 'approved' : 'rejected';
    await application.save();

    const personnel = await User.findById(application.personnel);
    if (personnel) {
      personnel.status = action === 'approve' ? 'approved' : 'rejected';
      await personnel.save();
      // TODO: Notify personnel
    }

    res.status(200).json({ message: `Personnel ${action}d successfully` });
  } catch (err) {
    console.error('Approval error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = {
  registerUser,
  loginUser,
  approveBarbershop,
  approvePersonnel,
};