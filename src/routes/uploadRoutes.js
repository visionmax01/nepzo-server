import express from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { upload } from '../middleware/uploadMiddleware.js';
import { uploadFile } from '../controllers/uploadController.js';
import { streamMedia } from '../controllers/mediaController.js';

const router = express.Router();

router.post('/upload', authMiddleware, upload, uploadFile);
router.get('/media/*key', authMiddleware, streamMedia);

export { router as uploadRouter };

