const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.v5wedkm.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    const db = client.db("PetAdoption");

    const petCollection = db.collection("petData");
    const adoptionCollection = db.collection("adoptionRequests");
    const donationCollection = db.collection("DonationCampaigns");
    const usersCollection = db.collection("users"); // NEW collection for users

    // Admin role verification middleware
    const verifyAdmin = async (req, res, next) => {
      try {
        const userEmail = req.headers['x-user-email']; // Expect user's email sent via header
        if (!userEmail) {
          return res.status(401).json({ message: "Missing user email for admin verification" });
        }
        const user = await usersCollection.findOne({ email: userEmail });
        if (!user || user.role !== 'admin') {
          return res.status(403).json({ message: "Access denied. Admins only." });
        }
        next();
      } catch (error) {
        console.error("Admin verify error:", error);
        res.status(500).json({ message: "Server error verifying admin" });
      }
    };

    // Root route
    app.get('/', (req, res) => {
      res.send('🐾 Pet adoption server is running!');
    });

    // User management routes

    // Add or update user (called on login/register)
    app.post('/api/users', async (req, res) => {
      const { name, email, profileImage } = req.body;
      if (!email || !name) {
        return res.status(400).json({ message: "Name and email are required" });
      }

      try {
        const result = await usersCollection.updateOne(
          { email },
          { 
            $set: { name, email, profileImage }, 
            $setOnInsert: { role: "user" } // default role 'user' on insert only
          },
          { upsert: true }
        );
        res.status(200).json({ message: "User saved/updated successfully" });
      } catch (error) {
        console.error("Error saving user:", error);
        res.status(500).json({ message: "Failed to save user" });
      }
    });

    // Get all users - admin only
    app.get('/api/users', verifyAdmin, async (req, res) => {
      try {
        const users = await usersCollection
          .find({}, { projection: { name: 1, email: 1, profileImage: 1, role: 1 } })
          .toArray();
        res.status(200).json(users);
      } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({ message: "Failed to fetch users" });
      }
    });

    // Update user role - admin only
    app.patch('/api/users/:id/role', verifyAdmin, async (req, res) => {
      const { id } = req.params;
      const { role } = req.body;
      if (!['user', 'admin'].includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }
      try {
        const result = await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { role } }
        );
        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "User not found" });
        }
        res.status(200).json({ message: `User role updated to ${role}` });
      } catch (error) {
        console.error("Error updating user role:", error);
        res.status(500).json({ message: "Failed to update user role" });
      }
    });

    // Your existing routes:

    app.get('/api/pets', async (req, res) => {
      const pets = await petCollection.find().toArray();
      res.send(pets);
    });

    app.get('/api/mypets', async (req, res) => {
      const { email } = req.query;
      if (!email) {
        return res.status(400).json({ message: "Email query param is required" });
      }

      try {
        const pets = await petCollection.find({ userEmail: email }).toArray();
        res.status(200).json(pets);
      } catch (error) {
        console.error("Failed to fetch user's pets:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    app.get('/api/pets/:id', async (req, res) => {
      const id = req.params.id;
      const pet = await petCollection.findOne({ id });
      if (!pet) return res.status(404).send({ message: "Pet not found" });
      res.send(pet);
    });

    app.post('/api/adopt', async (req, res) => {
      const {
        petId,
        petName,
        petImage,
        requesterName,
        requesterEmail,
        requesterPhone,
        requesterAddress,
        ownerEmail
      } = req.body;

      if (!petId || !petName || !requesterName || !requesterEmail) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const newRequest = {
        petId,
        petName,
        petImage: petImage || "",
        requesterName,
        requesterEmail,
        requesterPhone: requesterPhone || "",
        requesterAddress: requesterAddress || "",
        ownerEmail: ownerEmail || "",
        status: "pending",
        createdAt: new Date(),
      };

      try {
        const result = await adoptionCollection.insertOne(newRequest);
        res.status(201).json({ message: "Adoption request submitted", id: result.insertedId });
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to submit adoption request" });
      }
    });

    app.get('/api/adoptions', async (req, res) => {
      try {
        const requests = await adoptionCollection
          .find({})
          .sort({ createdAt: -1 })
          .toArray();
        res.status(200).json(requests);
      } catch (error) {
        console.error("Error fetching adoption requests:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    app.patch('/api/adoptions/:id/status', async (req, res) => {
      const { id } = req.params;
      const { status } = req.body;

      if (!["pending", "accepted", "rejected"].includes(status)) {
        return res.status(400).json({ message: "Invalid status value" });
      }

      try {
        const result = await adoptionCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "Adoption request not found" });
        }

        res.status(200).json({ message: `Request status updated to ${status}` });
      } catch (error) {
        console.error("Error updating adoption request status:", error);
        res.status(500).json({ message: "Failed to update status" });
      }
    });

    app.get('/api/donations', async (req, res) => {
      const { email } = req.query;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 6;
      const skip = (page - 1) * limit;

      const filter = email ? { creatorEmail: email } : {};

      try {
        const campaigns = await donationCollection
          .find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .toArray();

        res.status(200).json(campaigns);
      } catch (error) {
        console.error("Error fetching donation campaigns:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    app.get('/api/my-donations', async (req, res) => {
      const { email } = req.query;
      if (!email) {
        return res.status(400).json({ message: "Email query param is required" });
      }

      try {
        const campaigns = await donationCollection
          .find({ creatorEmail: email })
          .sort({ createdAt: -1 })
          .toArray();

        res.status(200).json(campaigns);
      } catch (error) {
        console.error("Error fetching user's donation campaigns:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    app.post('/api/donations', async (req, res) => {
      const {
        petName,
        image,
        maxDonation,
        location,
        description,
        lastDate,
        shortDescription,
        longDescription,
        creatorEmail
      } = req.body;

      if (!petName || !image || !maxDonation || !lastDate || !shortDescription || !longDescription || !creatorEmail) {
        return res.status(400).json({ message: 'Missing required fields' });
      }

      const newCampaign = {
        petName,
        image,
        maxDonation: Number(maxDonation),
        donatedAmount: 0,
        location: location || '',
        shortDescription,
        longDescription,
        lastDate: new Date(lastDate),
        createdAt: new Date(),
        creatorEmail,
        paused: false,
      };

      try {
        const result = await donationCollection.insertOne(newCampaign);
        res.status(201).json({ message: 'Donation campaign created', id: result.insertedId });
      } catch (error) {
        console.error('Error creating donation campaign:', error);
        res.status(500).json({ message: 'Internal server error' });
      }
    });

    app.patch('/api/donations/:id/donate', async (req, res) => {
      const { id } = req.params;
      const { amount } = req.body;

      if (!amount || isNaN(amount)) {
        return res.status(400).json({ message: "Amount must be a valid number" });
      }

      try {
        const result = await donationCollection.updateOne(
          { _id: new ObjectId(id) },
          { $inc: { donatedAmount: Number(amount) } }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "Campaign not found" });
        }

        res.json({ message: "Donation recorded successfully" });
      } catch (error) {
        console.error("Error updating donation:", error);
        res.status(500).json({ message: "Failed to update donation amount" });
      }
    });

    app.get('/api/donations/:id', async (req, res) => {
      const { id } = req.params;
      try {
        const campaign = await donationCollection.findOne({ _id: new ObjectId(id) });

        if (!campaign) {
          return res.status(404).json({ message: "Campaign not found" });
        }

        res.json(campaign);
      } catch (error) {
        console.error("Error fetching donation campaign:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    app.get('/api/donations/search', async (req, res) => {
      const { pet, location } = req.query;
      const query = {};

      if (pet) query.petName = { $regex: pet, $options: 'i' };
      if (location) query.location = { $regex: location, $options: 'i' };

      try {
        const results = await donationCollection
          .find(query)
          .sort({ createdAt: -1 })
          .toArray();

        res.send(results);
      } catch (error) {
        console.error("Error filtering campaigns:", error);
        res.status(500).send({ message: "Failed to fetch filtered campaigns" });
      }
    });

    app.post('/api/pets', async (req, res) => {
      const pet = req.body;

      if (!pet.name || !pet.age || !pet.category || !pet.image || !pet.location) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      pet.adopted = false;
      pet.createdAt = new Date();

      try {
        const result = await petCollection.insertOne(pet);
        res.status(201).json({ message: "Pet added successfully", id: result.insertedId });
      } catch (error) {
        console.error("Error adding pet:", error);
        res.status(500).json({ message: "Failed to add pet" });
      }
    });

  } catch (err) {
    console.error("Database connection failed:", err);
  }
}

run().catch(console.dir);

// Start server
app.listen(port, () => {
  console.log(`🚀 Server is running at http://localhost:${port}`);
});
