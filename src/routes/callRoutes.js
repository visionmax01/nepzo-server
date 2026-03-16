import express from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { getCurrentCall } from '../controllers/callController.js';
import { createCallLogEntry, getCallLogs, clearCallLogs } from '../controllers/callLogController.js';

const router = express.Router();

router.get('/calls/current', authMiddleware, getCurrentCall);
router.get('/call-logs',    authMiddleware, getCallLogs);
router.post('/call-logs',   authMiddleware, createCallLogEntry);
router.delete('/call-logs', authMiddleware, clearCallLogs);

export { router as callRouter };

