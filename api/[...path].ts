import { createApiApp } from "../server/_core/app.js";

// Vercel invokes the Express application directly; no listen() call is made.
export default createApiApp();
