const express = require('express');
const app = express();
const port = 3000;
require('dotenv').config();

const cors = require('cors');
const corsOptions = {
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  methods: ['GET', 'POST']
};
app.use(cors(corsOptions));

const driveData = require('./routes/driveData');
const saveData = require('./routes/saveData');
const Folder = require('./models/Folder')
const getFolder = require('./routes/getFolders')
const audioProxy = require('./routes/audioProxy');


app.use(express.json());

app.use('/data', driveData);
app.use('/saveData', saveData);
app.use('/getFolders', getFolder)
app.use('/audio', audioProxy);

app.get("/uptime", (req, res) => {
  res.status(200).json({ ok: true });
});


app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});