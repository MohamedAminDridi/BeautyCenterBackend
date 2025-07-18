const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Barbershop = require('../models/barbershop');
const PersonnelApplication = require('../models/PersonnelApplication');

const registerUser = async (req, res) => {
  const { firstName, lastName, phone, email, password, role, barbershopInfo, servicesOffered, bio, profileImageUrl, documents } = req.body;

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
      profileImageUrl: profileImageUrl || null,
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
        location: { address, coordinates: { latitude: parseFloat(latitude), longitude: parseFloat(longitude) } },
        logoUrl: profileImageUrl || null,
        documents: documents || [],
        owner: newUser._id,
        status: 'pending',
      });

      await newBarbershop.save();
      console.log('Created new barbershop:', newBarbershop._id);

      newUser.barbershop = newBarbershop._id;
      await newUser.save();
    }

    if (role === 'personnel' && barbershopInfo) {
      let barbershopData = typeof barbershopInfo === 'string' ? JSON.parse(barbershopInfo) : barbershopInfo;
      const { barbershopId } = barbershopData;
      console.log('Personnel registration with barbershopId:', barbershopId);
      const barbershop = await Barbershop.findById(barbershopId);
      if (!barbershop) {
        return res.status(400).json({ message: 'Barbershop not found' });
      }

      const application = new PersonnelApplication({
        personnel: newUser._id,
        barbershop: barbershop._id,
        bio,
        servicesOffered: typeof servicesOffered === 'string' ? servicesOffered.split(',').map(s => s.trim()) : servicesOffered || [],
        photoUrl: profileImageUrl || null,
        status: 'pending',
      });

      await application.save();
      console.log('Created PersonnelApplication:', application._id);
      newUser.barbershop = barbershop._id;
      await newUser.save();
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
      barbershopId: newUser.barbershop?.toString() || null,
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const loginUser = async (req, res) => {
  const { phone, password } = req.body;

  if (!phone || !password) {
    return res.status(400).json({ message: 'Phone and password are required' });
  }

  try {
    const user = await User.findOne({ phone }).select('firstName lastName phone role barbershop profileImageUrl isActive status password');
    if (!user) {
      console.log('User not found for phone:', phone);
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    console.log('Raw user data from login:', user); // Debug: Log raw user data

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

    const response = {
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
        barbershop: user.barbershop, // Include for debugging
      },
      barbershopId: user.barbershop?.toString() || null, 
    };
    console.log('Login Response:', response); // Debug: Log response
    res.status(200).json(response);
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ADD THIS NEW ENDPOINT - Get current user info
const getCurrentUser = async (req, res) => {
  try {
    // req.user is set by your authentication middleware
    const user = await User.findById(req.user.id)
      .select('firstName lastName phone email role barbershop profileImageUrl isActive status')
      .populate('barbershop', 'name _id'); // Optionally populate barbershop info

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if user is still active and approved
    if (user.status === 'pending') {
      return res.status(403).json({ message: 'Account is pending approval' });
    }

    if (user.status === 'rejected') {
      return res.status(403).json({ message: 'Account was rejected' });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'Account is deactivated' });
    }

    const response = {
      _id: user._id,
      phone: user.phone,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImageUrl: user.profileImageUrl,
      isActive: user.isActive,
      status: user.status,
      barbershopId: user.barbershop?.toString() || null,
      barbershop: user.barbershop, // Include populated barbershop info if needed
    };

    res.status(200).json(response);
  } catch (err) {
    console.error('Get current user error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const approveBarbershop = async (req, res) => {
  const { barbershopId, action } = req.body;
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
    }

    res.status(200).json({ message: `Barbershop ${action}d successfully` });
  } catch (err) {
    console.error('Approval error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const approvePersonnel = async (req, res) => {
  const { applicationId, action } = req.body;
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
  getCurrentUser, // Export the new function
  approveBarbershop,
  approvePersonnel,
};