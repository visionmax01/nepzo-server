import { handleUpload } from '../services/mediaService.js';

export const uploadFile = async (req, res, next) => {
  try {
    const type = req.query.type || 'chat-image';
    const result = await handleUpload(req.file, type);
    res.json({
      success: true,
      url: result.url,
      key: result.key,
    });
  } catch (err) {
    next(err);
  }
};

