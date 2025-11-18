const express = require('express');
const app = express();
const port = 3000;
require('dotenv').config();

const driveData = require('./routes/driveData');
const saveData = require('./routes/saveData');
const Folder = require('./models/Folder')


const corsOptions = {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ['GET', 'POST']
};
const cors = require('cors');
app.use(cors(corsOptions));


app.use(express.json());

app.use('/data', driveData);
app.use('/saveData',saveData);

app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`);
});