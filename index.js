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
const mongoDbUrl = process.env.MONGO_DB_URL || "mongodb+srv://yogeshoza33333:xgMYHTyzNEggqxYC@cluster0.pwjc7nq.mongodb.net/kezeo_webhook?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(mongoDbUrl)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Error connecting to MongoDB:', err));

// Define a Mongoose schema with a flexible structure
const webhookSchema = new mongoose.Schema({
    payload: { type: Object, required: true }, // Store the entire request body
    createdAt: { type: Date, default: Date.now },
});

// Create a model
const Webhook = mongoose.model('Webhook', webhookSchema);

// Endpoint for Kezeo webhook
app.post('/webhook', async (req, res) => {
    const eventData = req.body;

    try {
        // Store the entire request body as a payload
        const newWebhook = new Webhook({
            payload: eventData, // Save everything from req.body
        });

        await newWebhook.save();
        res.status(200).send({ message: 'Webhook data saved successfully' });
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
