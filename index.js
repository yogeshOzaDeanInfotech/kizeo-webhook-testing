const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require("dotenv").config();
const morgan = require('morgan');
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const PDFDocument = require('pdfkit');
const path = require('path');
const puppeteer = require('puppeteer');
const Handlebars = require("handlebars");

const app = express();
const PORT = 4000;

// Middleware to parse JSON bodies
app.use(express.json({ limit: '50mb' }));

app.use(cors({
    origin: "*", // Allows requests from any origin
}));

app.use(morgan('combined'));

// Connect to MongoDB database
const mongoDbUrl ="mongodb+srv://yogeshoza33333:xgMYHTyzNEggqxYC@cluster0.pwjc7nq.mongodb.net/hughes?retryWrites=true&w=majority&appName=Cluster0";

// ServiceNow API credentials
const SERVICE_NOW_USER = 'n.gradwell@hugheseurope.com';
const SERVICE_NOW_PASS = '0}4+9Dub-a';

mongoose.connect(mongoDbUrl)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Error connecting to MongoDB:', err));

// Define a Mongoose schema with a flexible structure
const webhookSchema = new mongoose.Schema({
    incidentNumber: { type: String, required: true },
    payload: { type: Object, required: true },
    createdAt: { type: Date, default: Date.now },
    sub_task_details: { type: Object }
});

// Define a flexible schema for dynamic data
const dynamicDataSchema = new mongoose.Schema({
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    createdAt: { type: Date, default: Date.now },
});

// Create a model for dynamic data
const DynamicData = mongoose.model('DynamicData', dynamicDataSchema);

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
            sub_task_details: eventData.data && eventData.data.sub_task_number ? eventData : null,
        });

        await newWebhook.save();
        console.log('New Webhook Data Saved:', newWebhook);
        res.status(200).send({ message: 'Webhook data saved successfully' });
    } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/webhook-data', async (req, res) => {
    try {
        const webhooks = await Webhook.find();
        console.log('Retrieved Webhook Data:', webhooks);
        res.status(200).send(webhooks);
    } catch (error) {
        console.error('Error retrieving webhooks:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/dynamic-webhook', async (req, res) => {
    const requestData = req.body;

    console.log('Received Dynamic Data:', requestData);

    try {
        // Save the incoming data into the DynamicData collection
        const dynamicRecord = new DynamicData({
            data: requestData,
        });

        await dynamicRecord.save();
        console.log('Dynamic Data Saved:', dynamicRecord);

        // send data into pdf in service now 

        // Step 1: Extract relevant fields from the received data
        const fields = requestData.data.fields;
        const customerProject = fields.customer_project2?.result?.value?.code || 'N/A';
        const engineerNames = fields.engineer_names?.result?.map((engineer) => engineer.value?.code).join(', ') || 'N/A';
        const siteAddress = fields.site_address?.result?.value?.address || 'N/A';
        const siteCity = fields.site_address?.result?.value?.city || 'N/A';
        const siteCountry = fields.site_address?.result?.value?.country || 'N/A';
        const subtaskNumber = fields.subtask_number?.result?.value || 'N/A';
        const descriptionOfWork = fields.description_of_work?.result?.value || 'N/A';
        const arrivalTime = fields.arrival_time?.result?.value?.hour || 'N/A';
        const departureTime = fields.departure_time?.result?.value?.hour || 'N/A';

        // Step 2: Create a PDF document
        const doc = new PDFDocument();

        // Ensure the directory exists before writing the PDF
        const pdfDir = path.join(__dirname, 'generated_pdfs');
        if (!fs.existsSync(pdfDir)) {
            fs.mkdirSync(pdfDir, { recursive: true });
        }

        const pdfPath = path.join(pdfDir, 'generatedFile.pdf');
        doc.pipe(fs.createWriteStream(pdfPath));

        doc.fontSize(16).text('Dynamic Webhook Data', { align: 'center' });

        doc.moveDown();
        doc.fontSize(12).text(`Customer Project: ${customerProject}`);
        doc.text(`Engineer Names: ${engineerNames}`);
        doc.text(`Site Address: ${siteAddress}`);
        doc.text(`City: ${siteCity}`);
        doc.text(`Country: ${siteCountry}`);
        doc.text(`Subtask Number: ${subtaskNumber}`);
        doc.text(`Description of Work: ${descriptionOfWork}`);
        doc.text(`Arrival Time: ${arrivalTime}`);
        doc.text(`Departure Time: ${departureTime}`);

        doc.end();

        // Step 3: Upload the PDF to ServiceNow

        // Read the generated PDF file
        const fileContent = fs.readFileSync(pdfPath);

        // Prepare the form data for the file upload
        const formData = new FormData();
        formData.append('file', fileContent, 'generatedFile.pdf');

        // Parameters for the URL
        const params = {
            table_name: 'u_sub_task',
            table_sys_id: '4af7cd431bd6d210a828a792b24bcb00',
            file_name: 'generatedFile.pdf'
        };

        // Configure the API request to ServiceNow
        const response = await axios.post(
            'https://hnseutest.service-now.com/api/now/attachment/file',
            formData,
            {
                headers: {
                    'Authorization': `Basic ${Buffer.from(`${SERVICE_NOW_USER}:${SERVICE_NOW_PASS}`).toString('base64')}`,
                    'Content-Type': 'multipart/form-data'
                },
                params: params
            }
        );

        console.log('ServiceNow Response:', response.data);
       // end

        res.status(200).send({ message: 'Dynamic data saved successfully', record: dynamicRecord });
    } catch (error) {
        console.error('Error saving dynamic data:', error);
        res.status(500).send({ message: 'Internal Server Error', error });
    }
});


// Endpoint to retrieve all dynamic data
app.get('/dynamic-webhook', async (req, res) => {
    try {
        const records = await DynamicData.find();
        console.log('Retrieved Dynamic Data:', records);
        res.status(200).send(records);
    } catch (error) {
        console.error('Error retrieving dynamic data:', error);
        res.status(500).send({ message: 'Internal Server Error', error });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});




async function generatePDF(data) {
    try {
        // Read the HTML template
        const templateHtml = fs.readFileSync(path.join(__dirname, "template.html"), "utf8");

        // Compile the template with Handlebars
        const template = Handlebars.compile(templateHtml);
        const compiledHtml = template(data);

        // Launch Puppeteer
        const browser = await puppeteer.launch();
        const page = await browser.newPage();

        // Set the compiled HTML
        await page.setContent(compiledHtml, { waitUntil: "domcontentloaded" });

        // Generate PDF
        await page.pdf({
            path: "jobsheet.pdf",
            format: "A4",
            printBackground: true,
        });

        await browser.close();
        console.log("PDF generated successfully!");
    } catch (error) {
        console.error("Error generating PDF:", error);
    }
}

// Dynamic data with multiple attachments
const data = {
    logo: "hughes_logo.png",
    customerName: "Yogesh",
    engineerName: "Chris White",
    latLong: "53.4510847, -2.0404963 - 223",
    siteAddress: "One Shop, 45 Hattersley Road West, SK14 3HE, Hattersley, United Kingdom",
    siteCode: "47060101",
    jobType: "RE-POINT",
    san: "CMW12571",
    orderNumber: "N/A",
    arrivalTime: "09:20",
    sjn: "N/A",
    accessEquipment: "Telescopic ladder",
    departureTime: "10:47",
    description: "Repointed edge antenna from EB to W2a as requested. New SAN - CMW01155 pfcB. Site online and trading.",
    customerSignature: {
        name: "Audra",
        position: "Assistant",
        signature: "signature_image.png",
        date: "08/11/2024",
    },
    attachments: [
        "attachment1.png",
        "attachment2.png",
        "attachment3.png",
    ],
};

// Generate PDF
generatePDF(data);


