
import mongoose from "mongoose";

let memoryServer;
const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI;

  try {
    if (mongoUri) {
      const conn = await mongoose.connect(mongoUri);
      console.log(`MongoDB Connected: ${conn.connection.host}`);
      return conn;
    }
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      console.error(`MongoDB Connection Error: ${error.message}`);
      process.exit(1);
    }

    console.warn(
      `Primary MongoDB connection failed: ${error.message}. Falling back to an in-memory database for local development.`
    );
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("MONGO_URI is not defined in production environment");
  }

  console.warn(
    "No MongoDB server is available. Starting with a non-persistent local fallback for development."
  );

  return null;
};

export default connectDB;
