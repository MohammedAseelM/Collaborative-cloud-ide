// src/config/multer.js
// Responsibility: Configure multer for file uploads

import multer from "multer";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit per file
  },
});

// Support for multiple files upload
const uploadMultiple = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit per file
    files: 500, // Up to 500 files per folder import batch
  },
});

export default upload;
export { uploadMultiple };
