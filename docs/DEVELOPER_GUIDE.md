# Collaborative Cloud IDE - Developer Setup & Deployment Guide

This guide explains how to set up the Collaborative Cloud IDE codebase locally for development, configure environment variables, and deploy it to a production environment.

---

## 1. Prerequisites

Before setting up the project, ensure you have the following runtimes installed:
* **Node.js** (v18.x or v22.x LTS recommended)
* **MongoDB** Community Edition (v6.x, v7.x, or v8.x)
* **Docker Desktop** (Active daemon required for code execution sandboxing)
* **Git** version manager

---

## 2. Getting Started

### Clone the Repository
```bash
git clone <repository_url>
cd collaborative-cloud-ide
```

### Install Dependencies
The project is split into separate `/backend` and `/frontend` directories. Install dependencies in both folders:

```bash
# Install Backend dependencies
cd backend
npm install

# Install Frontend dependencies
cd ../frontend
npm install
```

---

## 3. Configuration (Environment Variables)

### Backend Configuration
Create a `.env` file in the root of the `/backend` directory. Here is a configuration template:

```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/collaborative-cloud-ide
JWT_SECRET=replace_with_a_secure_jwt_random_secret_key_32_bytes
JWT_EXPIRE=7d
CLIENT_URL=http://localhost:5173
NODE_ENV=development
```

### Frontend Configuration
The frontend communicates with the backend via the base API configuration in `frontend/src/services/api.js`. In development mode, Axios requests default to `http://localhost:5000/api`.

---

## 4. Running the Project Locally

To run the application locally, you must start the database, backend server, and frontend server.

### Step 1: Start MongoDB
Ensure your MongoDB service is running on port `27017`. You can spin it up with a custom database path:

```bash
mongod --dbpath ./backend/data --port 27017
```

### Step 2: Start the Backend API Server
Open a new terminal window, navigate to the `/backend` directory, and start the development server:

```bash
cd backend
npm run dev
```
* The backend server will start on port `5000` (e.g. `http://localhost:5000`).
* Live code reloads are handled automatically via `nodemon`.

### Step 3: Start the Frontend Vite Server
Open a new terminal window, navigate to the `/frontend` directory, and start the Vite server:

```bash
cd frontend
npm run dev
```
* The React client will start on `http://localhost:5173`.
* Vite handles instant hot-module replacements (HMR).

---

## 5. Docker Sandbox Code Runner Integration

To test sandboxed code execution locally, ensure your Docker Desktop daemon is running:

1. **Verify Docker CLI is available**:
   ```bash
   docker --version
   ```
2. **Execution Flow**: When a user clicks **Run Code**, the backend dynamically creates a scratch file, mounts it, and runs a temporary, resource-limited Docker container.
3. **No Setup Required**: The backend automatically pulls the required language images (e.g., `node:alpine`, `python:alpine`, `gcc:alpine`, `openjdk:alpine`) upon the first code run if they are not already cached locally.

---

## 6. Production Deployment

To package and deploy the application for production:

### 1. Build the Frontend
1. Navigate to the `/frontend` directory.
2. Compile static assets:
   ```bash
   npm run build
   ```
3. Vite will output the optimized build package to the `/dist` directory.
4. Upload these static assets to a hosting provider (such as Vercel, Netlify, AWS S3, or Nginx).

### 2. Package the Backend
1. Deploy the `/backend` Node.js server to an application host (such as AWS EC2, Render, Heroku, or DigitalOcean).
2. Set the `NODE_ENV` environment variable to `production`.
3. Provide production-grade secrets for `MONGO_URI` and `JWT_SECRET`.
4. **Important**: The host machine running your backend API must have the Docker daemon active so that it can spawn sandboxed runner containers.
5. In production, Nginx or an API gateway should proxy requests:
   * `/api/*` -> Forwarded to Node.js backend port `5000`
   * `/socket.io/*` -> Websocket proxy forwarded to Node.js backend port `5000`
   * `/*` -> Serves static index HTML file assets from the frontend build.
