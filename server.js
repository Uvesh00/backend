const express = require('express');
const axios = require('axios');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const OpenAI = require('openai');
const { parse } = require('csv-parse');
const PDFDocument = require('pdfkit');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Set up Multer storage for uploading files
const upload = multer({ dest: 'uploads/' });

// RapidAPI credentials
const RAPIDAPI_KEY = '90663c4c37mshb27898f45f46664p1f51eajsn817dcb7dc289';
const RAPIDAPI_HOST = 'gaialens-esg-scores.p.rapidapi.com';
const ESG_API_URL = 'https://gaialens-esg-scores.p.rapidapi.com/scores';

// OpenAI API key
const OPENAI_API_KEY = 'api_key';
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// API for fetching ESG data for a company from RapidAPI
app.get('/api/company/:name', async (req, res) => {
    const companyName = req.params.name;
    try {
        const response = await axios.get(`${ESG_API_URL}?companyname=${companyName}`, {
            headers: {
                'x-rapidapi-key': RAPIDAPI_KEY,
                'x-rapidapi-host': RAPIDAPI_HOST
            }
        });
        res.json(response.data[0]); // Send the first object from the array
    } catch (error) {
        console.error('Error fetching ESG data:', error.message);
        res.status(500).json({ error: 'Error fetching ESG data' });
    }
});

// Endpoint to handle natural language queries
app.post('/api/query', async (req, res) => {
    const userInput = req.body.query;
    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: userInput }],
        });
        const answer = response.choices[0].message.content;
        res.json({ answer });
    } catch (error) {
        console.error('Error querying LLM:', error);
        res.status(500).json({ error: 'Error querying LLM' });
    }
});

// Endpoint for exporting ESG data as CSV
app.post('/api/export/csv', (req, res) => {
    const esgData = req.body.data;
    if (!esgData) return res.status(400).json({ error: 'No data provided' });

    const csvHeaders = 'Company,Industry,Country,Overall Score,Transparency Score,Environmental Score,Social Score,Governance Score\n';
    const csvRows = `${esgData.companyname},${esgData.industry},${esgData.country},${esgData['Overall Score']},${esgData['Overall Transparency Score']},${esgData['Environmental Pillar Score']},${esgData['Social Pillar Score']},${esgData['Governance Pillar Score']}\n`;

    const csvContent = csvHeaders + csvRows;

    res.setHeader('Content-Disposition', 'attachment; filename="esg-data.csv"');
    res.set('Content-Type', 'text/csv');
    res.status(200).send(csvContent);
});

// Endpoint for exporting ESG data as PDF
app.post('/api/export/pdf', (req, res) => {
    const esgData = req.body.data;
    if (!esgData) return res.status(400).json({ error: 'No data provided' });

    const doc = new PDFDocument();
    let buffers = [];

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        res.setHeader('Content-Disposition', 'attachment; filename="esg-report.pdf"');
        res.set('Content-Type', 'application/pdf');
        res.status(200).send(pdfData);
    });

    doc.text(`ESG Report for ${esgData.companyname}`);
    doc.text(`Industry: ${esgData.industry}`);
    doc.text(`Country: ${esgData.country}`);
    doc.text(`Overall Score: ${esgData['Overall Score']}`);
    doc.text(`Transparency Score: ${esgData['Overall Transparency Score']}`);
    doc.text(`Environmental Score: ${esgData['Environmental Pillar Score']}`);
    doc.text(`Social Score: ${esgData['Social Pillar Score']}`);
    doc.text(`Governance Score: ${esgData['Governance Pillar Score']}`);

    doc.end();
});

// Endpoint for importing ESG data from CSV
app.post('/api/import/csv', upload.single('file'), (req, res) => {
    const filePath = req.file.path;

    const esgDataArray = [];
    fs.createReadStream(filePath)
        .pipe(parse({ delimiter: ',', columns: true }))
        .on('data', (row) => {
            esgDataArray.push(row);
        })
        .on('end', () => {
            fs.unlinkSync(filePath); // Delete file after parsing
            res.json({ data: esgDataArray });
        })
        .on('error', (err) => {
            console.error('Error reading CSV file:', err);
            res.status(500).json({ error: 'Error reading CSV file' });
        });
});

// Endpoint for importing ESG data from PDF
app.post('/api/import/pdf', upload.single('file'), (req, res) => {
    const filePath = req.file.path;
    const dataBuffer = fs.readFileSync(filePath);

    PDFParser(dataBuffer).then((data) => {
        const text = data.text;
        // Assuming the PDF content can be structured as an object
        // This part needs to be adapted based on how your PDF is structured
        const lines = text.split('\n');
        const esgData = {
            companyname: lines[0] || 'Unknown Company',
            industry: lines[1] || 'Unknown Industry',
            country: lines[2] || 'Unknown Country',
            'Overall Score': parseFloat(lines[3]) || 0,
            'Overall Transparency Score': parseFloat(lines[4]) || 0,
            'Environmental Pillar Score': parseFloat(lines[5]) || 0,
            'Social Pillar Score': parseFloat(lines[6]) || 0,
            'Governance Pillar Score': parseFloat(lines[7]) || 0,
        };
        fs.unlinkSync(filePath); // Delete file after parsing
        res.json({ data: esgData });
    }).catch((err) => {
        console.error('Error reading PDF file:', err);
        res.status(500).json({ error: 'Error reading PDF file' });
    });
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
