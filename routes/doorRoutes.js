// const express = require('express');
// const router = express.Router();
// const Door = require('../models/Door')

// //
// router.put('/update-status/:id', async (req, res) => {
//   try {
//     const { status } = req.body;
//     if (!['open', 'closed'].includes(status)) {
//       return res.status(400).json({ error: 'Invalid status' });
//     }

//     const updatedDoor = await Door.findByIdAndUpdate(
//       req.params.id, 
//       { status }, 
//       { new: true }
//     );

//     if (!updatedDoor) return res.status(404).json({ error: "Door not found" });

//     res.json(updatedDoor);
//   } catch (error) {
//     res.status(500).json({ error: 'Failed to update door status' });
//   }
// });

// // ✅ Add a New Door (POST /api/doors)
// router.post('/', async (req, res) => {
//   try {
//     const { name, location, ownerId } = req.body; // ✅ Include ownerId

//     if (!ownerId) {
//       return res.status(400).json({ error: "ownerId is required" });
//     }

//     const newDoor = new Door({ name, location, ownerId });
//     await newDoor.save();

//     res.status(201).json({ message: 'Door added successfully', door: newDoor });
//   } catch (error) {
//     console.error('❌ Error adding door:', error);
//     res.status(500).json({ error: 'Internal Server Error' });
//   }
// });
// // ✅ Get All Doors (GET /api/doors)
// router.get('/', async (req, res) => {
//   try {
//     const doors = await Door.find();
//     res.status(200).json(doors);
//   } catch (error) {
//     console.error('❌ Error fetching doors:', error);
//     res.status(500).json({ error: 'Internal Server Error' });
//   }
// });

// // ✅ Delete a Door (DELETE /api/doors/:id)
// router.delete('/:id', async (req, res) => {
//   try {
//     const { id } = req.params;
//     await Door.findByIdAndDelete(id);
//     res.json({ message: 'Door deleted successfully' });
//   } catch (error) {
//     console.error('❌ Error deleting door:', error);
//     res.status(500).json({ error: 'Internal Server Error' });
//   }
// });

// module.exports = router;
