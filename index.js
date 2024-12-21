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
const bcrypt = require('bcrypt');

const app = express();
const PORT = 4000;

// Middleware to parse JSON bodies
app.use(express.json({ limit: '50mb' }));

app.use(cors({
    origin: "*",
}));

app.use(morgan('combined'));

// Connect to MongoDB database
const mongoDbUrl ="mongodb+srv://yogesh12345:yogesh12345@cluster0.tcdxc.mongodb.net/hughes?retryWrites=true&w=majority&appName=Cluster0";

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

const userSchema = new mongoose.Schema({
    email: { type: String, required: true },
    password: { type: String, required: true },
    phone: { type: String, required: true },
    name: { type: String, required: true },
    status: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
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
const User = mongoose.model('User', userSchema);

  async function addDemoUser() {
    try {
      const hashedPassword = await bcrypt.hash('securepassword123', 10);
  
      const demoUser = new User({
        email: 'o.yogeshoza@deaninfotech.com',
        password: hashedPassword,
        phone: '1234567890',
        name: 'Yogesh Oza',
        status: 'active',
      });
  
      await demoUser.save();
      console.log('Demo user added successfully with encrypted password!');
    } catch (err) {
      console.error('Error adding demo user:', err);
    } finally {
      mongoose.connection.close();
    }
  }

//   addDemoUser();

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

app.get('/send-pdf', async (req, res) => {
    try {
        // Read the generated PDF file
        const fileContent = fs.readFileSync("./vehicle_checklist_V0.1-1-4.pdf");

        // Prepare the form data for the file upload
        const formData = new FormData();
        formData.append('file', fileContent, 'vehicle_checklist_V0.1-1-4.pdf');

        // Parameters for the URL
        const params = {
            table_name: 'u_sub_task',
            table_sys_id: '33e5ddb81b6a9a10192beb14b24bcb0e',
            file_name: 'SUB0164647_vehicle_checklist_V0.1-1-4.pdf'
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
        res.status(200).send("Pdf uploaded to server successfully!!!");
    } catch (error) {
        res.status(500).send({ message: 'Internal Server Error', error });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

function getBase64Image(filePath) {
    const file = fs.readFileSync(filePath);
    return `data:image/png;base64,${file.toString("base64")}`;
}

async function generatePDF(data) {
    try { 
        // Read the HTML template
        const templateHtml = fs.readFileSync(path.join(__dirname, "./templates/vehicle_checklist_template.html"), "utf8");

        // Compile the template with Handlebars
        const template = Handlebars.compile(templateHtml);
        const compiledHtml = template(data);


        // Launch Puppeteer
        const browser = await puppeteer.launch();
        const page = await browser.newPage();

        // Set the compiled HTML content
        await page.setContent(compiledHtml, { waitUntil: "networkidle0" });

        // Generate the PDF
        await page.pdf({
            path: data.filename,
            format: "A4",
            printBackground: true,
        });

        await browser.close();
        console.log("PDF generated successfully!");
    } catch (error) {
        console.error("Error generating PDF:", error);
    }
}

//JOB_sheet Data
// const data = {
//     filename :"SUB421452_JOB_SHEET.pdf",
//     logo: getBase64Image(path.resolve(__dirname, "./assests/hughes_logo.png")),
//     customerName: "Yogesh oza",
//     engineerName: "Chris White",
//     latLong: "53.4510847, -2.0404963 - 223",
//     siteAddress: "One Shop, 45 Hattersley Road West, SK14 3HE, Hattersley, United Kingdom",
//     siteCode: "47060101",
//     jobType: "RE-POINT",
//     san: "CMW12571",
//     orderNumber: "N/A",
//     arrivalTime: "09:20",
//     sjn: "N/A",
//     accessEquipment: "Telescopic ladder",
//     departureTime: "10:47",
//     description: "Repointed edge antenna from EB to W2a as requested. New SAN - CMW01155 pfcB. Site online and trading.",
//     customerSignature: {
//         name: "Audra",
//         position: "Assistant",
//         signature: "https://onlinepngtools.com/images/examples-onlinepngtools/george-walker-bush-signature.png",
//         date: "08/11/2024",
//     },
//     parts: [
//         {
//             partUsed : "Antena",
//             serialNumber : "SVMBJS54986416",
//             macAddress : "mac549545258464",
//             item : "Antena new ",
//         },
//         {
//             partUsed : "Antena",
//             serialNumber : "SVMBJS54986416",
//             macAddress : "mac549545258464",
//             item : "Antena new ",
//         },
//         {
//             partUsed : "Antena",
//             serialNumber : "SVMBJS54986416",
//             macAddress : "mac549545258464",
//             item : "Antena new ",
//         },
//     ],
//     attachments: [
//         "https://5.imimg.com/data5/SELLER/Default/2022/10/YJ/LT/WG/703975/amsler-lycra-attachment-spare-parts.jpg",
//         "https://5.imimg.com/data5/SELLER/Default/2022/10/YJ/LT/WG/703975/amsler-lycra-attachment-spare-parts.jpg",
//         "https://5.imimg.com/data5/SELLER/Default/2022/10/YJ/LT/WG/703975/amsler-lycra-attachment-spare-parts.jpg",
//         "https://5.imimg.com/data5/SELLER/Default/2022/10/YJ/LT/WG/703975/amsler-lycra-attachment-spare-parts.jpg",
//         "https://5.imimg.com/data5/SELLER/Default/2022/10/YJ/LT/WG/703975/amsler-lycra-attachment-spare-parts.jpg",
//         "https://5.imimg.com/data5/SELLER/Default/2022/10/YJ/LT/WG/703975/amsler-lycra-attachment-spare-parts.jpg",
//         "https://5.imimg.com/data5/SELLER/Default/2022/10/YJ/LT/WG/703975/amsler-lycra-attachment-spare-parts.jpg",
//         "https://5.imimg.com/data5/SELLER/Default/2022/10/YJ/LT/WG/703975/amsler-lycra-attachment-spare-parts.jpg"
//     ],
// };

//Rish_Assessment_Sheet Data
// const data = {
//     filename :"SUB421452_JOB_SHEET.pdf",
//     filename :"SUB421452_RISK_ASSESSMENT_SHEET.pdf",
//     logoBase64: getBase64Image(path.resolve(__dirname, "hughes_logo.png")),
//     customerName: "Yogesh oza",
//     engineerName: "Chris White",
//     latLong: "53.4510847, -2.0404963 - 223",
//     siteAddress: "One Shop, 45 Hattersley Road West, SK14 3HE, Hattersley, United Kingdom",
//     siteCode: "47060101",
//     jobType: "RE-POINT",
//     san: "CMW12571",
//     orderNumber: "N/A",
//     arrivalTime: "09:20",
//     sjn: "N/A",
//     accessEquipment: "Telescopic ladder",
//     departureTime: "10:47",
//     description: "Repointed edge antenna from EB to W2a as requested. New SAN - CMW01155 pfcB. Site online and trading.",
//     customerSignature: {
//         name: "Audra",
//         position: "Assistant",
//         signature: "https://onlinepngtools.com/images/examples-onlinepngtools/george-walker-bush-signature.png",
//         date: "08/11/2024",
//     },
//     parts: [
//         {
//             partUsed : "Antena",
//             serialNumber : "SVMBJS54986416",
//             macAddress : "mac549545258464",
//             item : "Antena new ",
//         },
//         {
//             partUsed : "Antena",
//             serialNumber : "SVMBJS54986416",
//             macAddress : "mac549545258464",
//             item : "Antena new ",
//         },
//         {
//             partUsed : "Antena",
//             serialNumber : "SVMBJS54986416",
//             macAddress : "mac549545258464",
//             item : "Antena new ",
//         },
//     ],
//     attachments: [
//         "https://5.imimg.com/data5/SELLER/Default/2022/10/YJ/LT/WG/703975/amsler-lycra-attachment-spare-parts.jpg",
//         "https://5.imimg.com/data5/SELLER/Default/2022/10/YJ/LT/WG/703975/amsler-lycra-attachment-spare-parts.jpg",
//         "https://5.imimg.com/data5/SELLER/Default/2022/10/YJ/LT/WG/703975/amsler-lycra-attachment-spare-parts.jpg",
//         "https://5.imimg.com/data5/SELLER/Default/2022/10/YJ/LT/WG/703975/amsler-lycra-attachment-spare-parts.jpg",
//         "https://5.imimg.com/data5/SELLER/Default/2022/10/YJ/LT/WG/703975/amsler-lycra-attachment-spare-parts.jpg",
//         "https://5.imimg.com/data5/SELLER/Default/2022/10/YJ/LT/WG/703975/amsler-lycra-attachment-spare-parts.jpg",
//         "https://5.imimg.com/data5/SELLER/Default/2022/10/YJ/LT/WG/703975/amsler-lycra-attachment-spare-parts.jpg",
//         "https://5.imimg.com/data5/SELLER/Default/2022/10/YJ/LT/WG/703975/amsler-lycra-attachment-spare-parts.jpg"
//     ],
// };

//vehicle_checklist_V0.1-1-4 Data
const data= {
    filename :"vehicle_checklist_V0.1-1-4.pdf",
    "logo1": getBase64Image(path.resolve(__dirname, "./assests/hughes_logo.png")),
    "logo2": getBase64Image(path.resolve(__dirname, "./assests/field_service_logo.png")),
    "title": "Hughes Weekly Vehicle Checklist",
    "date": "18/11/2024",
    "time": "08:39",
    "mileage": "24004",
    "vehicle": "Vauxhall Vivaro",
    "registration": "DP23 LZL",
    "checkedBy": "Adam Flatley",
    "signature": "https://onlinepngtools.com/images/examples-onlinepngtools/george-walker-bush-signature.png",
    "checklist": [
        { "item": "Safety Belts", "status": "OK", "remarks": "", "special": true },
        { "item": "Brakes / Steering", "status": "OK", "remarks": "", "special": true },
        { "item": "Engine (No Noises)", "status": "OK", "remarks": "", "special": true },
        { "item": "Gears", "status": "OK", "remarks": "", "special": true },
        { "item": "Heater / Air Conditioning", "status": "OK", "remarks": "", "special": true },
        { "item": "Wipers", "status": "OK", "remarks": "", "special": true },
        { "item": "Mirrors", "status": "OK", "remarks": "", "special": true },
        { "item": "Headlights: High Beam", "status": "OK", "remarks": "", "special": true },
        { "item": "Low Beam", "status": "OK", "remarks": "", "special": true },
        { "item": "Indicators/Hazards", "status": "OK", "remarks": "", "special": true },
        { "item": "Brake Lights / Tail Lights", "status": "OK", "remarks": "", "special": true },
        { "item": "Doors/Locks", "status": "OK", "remarks": "", "special": true },
        { "item": "Windows / Windscreen", "status": "OK", "remarks": "", "special": true },
        { "item": "Horn", "status": "OK", "remarks": "", "special": true },
        { "item": "", "status": "", "remarks": "" ,"special": true },
        { "item": "Tires - Tread/Condition", "status": "OK", "remarks": "", "special": true },
        { "item": "Proper Inflation", "status": "OK", "remarks": "" },
        { "item": "Dash Cam - Working", "status": "YES", "remarks": "", "special": true },
        { "item": "Fire Extinguisher", "status": "OK", "remarks": "", "special": true },
        { "item": "First Aid Kit", "status": "IN DATE", "remarks": "", "special": true },
        { "item": "Liquids Level Check:", "status": "", "remarks": "" },
        { "item": "Oil", "status": "FULL", "remarks": "", "special": true },
        { "item": "Coolant", "status": "FULL", "remarks": "" },
        { "item": "Window Washer", "status": "OK", "remarks": "", "special": true },
        { "item": "General Clean & Tidiness", "status": "YES", "remarks": "" },
    ],
    "attachments": [
      "https://5.imimg.com/data5/SELLER/Default/2022/10/YJ/LT/WG/703975/amsler-lycra-attachment-spare-parts.jpg",
      "https://5.imimg.com/data5/SELLER/Default/2022/10/YJ/LT/WG/703975/amsler-lycra-attachment-spare-parts.jpg",
      "https://5.imimg.com/data5/SELLER/Default/2022/10/YJ/LT/WG/703975/amsler-lycra-attachment-spare-parts.jpg",
      "https://5.imimg.com/data5/SELLER/Default/2022/10/YJ/LT/WG/703975/amsler-lycra-attachment-spare-parts.jpg",
    ]
  }

generatePDF(data);


