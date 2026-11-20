import { createServerlessHandler } from '../src/vercel.js';

// Vercel Serverless Function: every request (rewritten from /(.*) in vercel.json) is served by the Express app.
export default createServerlessHandler();
