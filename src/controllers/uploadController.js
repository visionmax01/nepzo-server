import { handleUpload } from '../services/mediaService.js';

const inferType = (mimetype) => {
  if (!mimetype) return 'chat-image';
  if (mimetype.startsWith('image/')) return 'chat-image';
  if (mimetype.startsWith('video/')) return 'chat-video';
  if (mimetype.startsWith('audio/')) return 'chat-audio';
  return 'chat-file';
};

export const uploadFile = async (req, res, next) => {
  try {
    const files = req.files || [];
    const defaultType = req.query.type || 'chat-image';

    if (files.length === 0) {
      return res.status(400).json({ success: false, error: 'No file provided' });
    }

    const results = await Promise.all(
      files.map((file) => {
        const type = req.query.type || inferType(file.mimetype);
        return handleUpload(file, type);
      }),
    );

    if (results.length === 1) {
      return res.json({
        success: true,
        url: results[0].url,
        key: results[0].key,
      });
    }

    return res.json({
      success: true,
      urls: results.map((r) => r.url),
      keys: results.map((r) => r.key),
    });
  } catch (err) {
    next(err);
  }
};

