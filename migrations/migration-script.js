const mongoose = require('mongoose');
const axios = require('axios');
const Barbershop = require('../models/barbershop'); // Adjust path to your Barbershop model
require('dotenv').config(); // Load environment variables

async function migrateLocations() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI , {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    // Find barbershops with old location format (string or missing coordinates)
    const barbershops = await Barbershop.find({
      $or: [
        { 'location.coordinates': { $exists: false } },
        { location: { $type: 'string' } },
      ],
    });

    if (barbershops.length === 0) {
      console.log('No barbershops need migration');
      return;
    }

    console.log(`Found ${barbershops.length} barbershops to migrate`);

    for (const barbershop of barbershops) {
      const address = typeof barbershop.location === 'string' ? barbershop.location : barbershop.location?.address;
      if (!address) {
        console.warn(`Skipping ${barbershop.name}: No valid address found`);
        continue;
      }

      try {
        // Geocode address using Google Maps API
        const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
          params: {
            address,
            key: process.env.GOOGLE_MAPS_API_KEY,
          },
        });

        if (response.data.status !== 'OK' || !response.data.results[0]) {
          throw new Error(`Geocoding failed: ${response.data.status}`);
        }

        const { lat, lng } = response.data.results[0].geometry.location;
        await Barbershop.updateOne(
          { _id: barbershop._id },
          {
            location: {
              address,
              coordinates: { latitude: lat, longitude: lng },
            },
          }
        );
        console.log(`Updated location for ${barbershop.name}: ${lat}, ${lng}`);
      } catch (error) {
        console.error(`Failed to geocode ${barbershop.name}: ${error.message}`);
      }
    }

    console.log('Migration completed');
  } catch (error) {
    console.error('Migration failed:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

migrateLocations().catch(console.error);