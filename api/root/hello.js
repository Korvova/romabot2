// api/root/hello.js
import { Router } from 'express';
const router = Router();

// GET /api/hello
router.get('/', (_req, res) => {
  res.json({ message: 'Hello from romabot2 API!' });
});

export default router;
