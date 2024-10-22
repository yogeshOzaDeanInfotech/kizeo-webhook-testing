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
    origin:"*",
}));

app.use(morgan('combined'));

// Connect to MongoDB database
const mongoDbUrl = "mongodb+srv://yogeshoza33333:xgMYHTyzNEggqxYC@cluster0.pwjc7nq.mongodb.net/kezeo_webhook?retryWrites=true&w=majority&appName=Cluster0" ||process.env.MONGO_DB_URL;

mongoose.connect(mongoDbUrl)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Error connecting to MongoDB:', err));

// Define a Mongoose schema
const webhookSchema = new mongoose.Schema({
    event: String,
    data: mongoose.Schema.Types.Mixed,
    createdAt: { type: Date, default: Date.now },
});

// Create a model
const Webhook = mongoose.model('Webhook', webhookSchema);

// Endpoint for Kezeo webhook
app.post('/webhook', async (req, res) => {
    const eventData = req.body;

    try {
        // Create a new document in the MongoDB collection
        const newWebhook = new Webhook({
            event: eventData.event,
            data: eventData.data,
        });

        await newWebhook.save(); // Save to the database

        // Send a response back to Kezeo
        res.status(200).send({message : 'Webhook received and saved'});
    } catch (error) {
        console.error('Error saving webhook:', error);
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
