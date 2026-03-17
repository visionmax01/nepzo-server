import express from 'express';
import { getWebRTCConfig } from '../controllers/configController.js';

const router = express.Router();

router.get('/config/webrtc', getWebRTCConfig);

export { router as configRouter };
