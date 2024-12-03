const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require("dotenv").config();
const morgan = require('morgan');

const app = express();
const PORT = 4000;

// Middleware to parse JSON bodies
app.use(express.json());
app.use(cors({
    origin: "*", // Allows requests from any origin
}));

app.use(morgan('combined'));

// Connect to MongoDB database
const mongoDbUrl = "mongodb+srv://yogeshoza33333:xgMYHTyzNEggqxYC@cluster0.pwjc7nq.mongodb.net/kezeo_webhook?retryWrites=true&w=majority&appName=Cluster0" || process.env.MONGO_DB_URL;

mongoose.connect(mongoDbUrl)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Error connecting to MongoDB:', err));

// Define a Mongoose schema
const webhookSchema = new mongoose.Schema({
    job_id: { type: String, required: true, unique: true },
    engineer_name: String,
    status: String,
    createdAt: { type: Date, default: Date.now },
});

// Create a model
const Webhook = mongoose.model('Webhook', webhookSchema);

// Endpoint for Kezeo webhook
app.post('/webhook', async (req, res) => {
    const eventData = req.body;

    try {
        // Check if a document with the same job_id already exists
        let existingWebhook = await Webhook.findOne({ job_id: eventData.data.job_id });

        if (existingWebhook) {
            // If the document exists, update it with the new data
            existingWebhook.engineer_name = eventData.data.engineer_name;
            existingWebhook.status = eventData.data.status;
            existingWebhook.createdAt = new Date();  // Update timestamp

            // Save the updated document
            await existingWebhook.save();

            res.status(200).send({ message: 'Webhook data updated successfully' });
        } else {
            // If the document does not exist, create a new one
            const newWebhook = new Webhook({
                job_id: eventData.data.job_id,
                engineer_name: eventData.data.engineer_name,
                status: eventData.data.status,
            });

            await newWebhook.save();
            res.status(200).send({ message: 'Webhook data created successfully' });
        }
    } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).send('Internal Server Error');
    }
});

// GET API to retrieve all data collected by webhook
app.get('/webhook-data', async (req, res) => {
    try {
        const webhooks = await Webhook.find();
        res.status(200).send(webhooks);
    } catch (error) {
        console.error('Error retrieving webhooks:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
