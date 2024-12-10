const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require("dotenv").config();
const morgan = require('morgan');

const app = express();
const PORT = 4000;

// Middleware to parse JSON bodies
app.use(express.json({ limit: '50mb' }));  // Set limit as needed

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
    incidentNumber: { type: String, required: true },
    payload: { type: Object, required: true },  // Store the entire request body
    createdAt: { type: Date, default: Date.now },
    sub_task_details: { type: Object } // New field to store subtask details
});

// Create a model
const Webhook = mongoose.model('Webhook', webhookSchema);

// Endpoint for Kezeo webhook
app.post('/webhook', async (req, res) => {
    const eventData = req.body;

    console.log('Received Webhook Data:', eventData);

    try {
        const incidentNumber = eventData.data?.number || eventData.number;
        const subTaskNumber = eventData.sub_task_number;
        console.log('Extracted Incident Number:', incidentNumber);
        console.log('sub_task_number:',subTaskNumber);

        if (!incidentNumber) {
            return res.status(400).send('Incident Number is required in the payload');
        }
        

        // Check if the record with the same incident number exists
        const existingWebhook = await Webhook.findOne({ incidentNumber });


        if (existingWebhook) {
            if (eventData.data || subTaskNumber) {
                console.log('Subtask received, adding to incident details...');
                existingWebhook.sub_task_details = eventData;
                existingWebhook.createdAt = Date.now(); 

                await existingWebhook.save();
                console.log('Webhook Data Updated with Subtask:', existingWebhook);
                return res.status(200).send({ message: 'Webhook data updated successfully with subtask' });
            } else {
                // If no sub_task data, treat it as an incident update
                existingWebhook.payload = eventData;
                existingWebhook.createdAt = Date.now();

                await existingWebhook.save();
                console.log('Webhook Data Updated:', existingWebhook);
                return res.status(200).send({ message: 'Webhook data updated successfully' });
            }
        }

        // If no existing record, create a new one
        const newWebhook = new Webhook({
            incidentNumber,
            payload: eventData,
            sub_task_details: eventData.data && eventData.data.sub_task_number ? eventData : null, // Add subtask details if available
        });

        await newWebhook.save();
        console.log('New Webhook Data Saved:', newWebhook);
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
        console.log('Retrieved Webhook Data:', webhooks); // Log the retrieved data
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
