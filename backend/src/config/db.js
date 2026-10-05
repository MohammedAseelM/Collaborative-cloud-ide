
import mongoose from "mongoose";

let memoryServer;
const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI;

  try {
    if (mongoUri) {
      const conn = await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 2000 });
      console.log(`MongoDB Connected: ${conn.connection.host}`);
      return conn;
    }
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      console.error(`MongoDB Connection Error: ${error.message}`);
      process.exit(1);
    }

    console.warn(
      `Primary MongoDB connection failed (${error.message}). Falling back to automated in-memory MongoDB instance...`
    );
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("MONGO_URI is not defined in production environment");
  }

  try {
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    memoryServer = await MongoMemoryServer.create();
    const memoryUri = memoryServer.getUri();
    const conn = await mongoose.connect(memoryUri);
    console.log(`Automated In-Memory MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (memError) {
    console.error(`Failed to start automated in-memory MongoDB: ${memError.message}`);
    return null;
  }
};

export default connectDB;
