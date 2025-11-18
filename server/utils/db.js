const mongoose = require('mongoose');

let isConnected = false; // global cache for serverless environments

async function connectDB() {
  if (isConnected) return mongoose;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Missing MONGODB_URI');
  await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  isConnected = true;
  console.log('MongoDB connected');
  return mongoose;
}

module.exports = connectDB;
