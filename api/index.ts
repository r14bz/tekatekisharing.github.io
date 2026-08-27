// api/index.ts
import app from '../server.js';   // penting: pakai .js (ESM convention)

export default function handler(req: any, res: any) {
  return app(req, res);
}