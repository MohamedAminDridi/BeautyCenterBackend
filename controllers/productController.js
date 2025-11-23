const Product = require('../models/Product');

exports.getAllProducts = async (req, res) => {
  try {
    const products = await Product.find().populate('personnel', 'name'); // Optional: populate personnel details
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createProduct = async (req, res) => {
  const { name, marque, category, quantity, unit, price, supplier, alertThreshold, description, imageUrl, personnel } = req.body;
  console.log('Received product data:', req.body);

  // Basic validation for imageUrl if provided
  if (imageUrl && !isValidUrl(imageUrl)) {
    return res.status(400).json({ error: 'Invalid image URL format' });
  }

  const newProduct = new Product({
    name,
    marque,
    category,
    quantity,
    unit,
    price,
    supplier,
    alertThreshold,
    description,
    imageUrl,
    personnel,
  });

  try {
    const savedProduct = await newProduct.save();
    res.status(201).json(savedProduct);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.updateProduct = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  // Basic validation for imageUrl if provided
  if (updates.imageUrl && !isValidUrl(updates.imageUrl)) {
    return res.status(400).json({ error: 'Invalid image URL format' });
  }

  try {
    const updatedProduct = await Product.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
    if (!updatedProduct) return res.status(404).json({ error: 'Product not found' });
    res.json(updatedProduct);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.deleteProduct = async (req, res) => {
  const { id } = req.params;

  try {
    const deletedProduct = await Product.findByIdAndDelete(id);
    if (!deletedProduct) return res.status(404).json({ error: 'Product not found' });
    res.json({ message: 'Product deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Helper function to validate URL
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}