const express = require('express');
const app = express();
const port = 3000;
require('dotenv').config();
app.use(express.json());

const cors = require('cors');

const driveData = require('./routes/driveData');

const corsOptions = {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ['GET', 'POST']
};

app.use(cors(corsOptions));

app.use('/data', driveData);

app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`);
});