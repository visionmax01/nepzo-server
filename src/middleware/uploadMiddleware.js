import multer from 'multer';

const MB = 1024 * 1024;
const MAX_FILE_SIZE = 50 * MB;   // 50MB per file (single image/video/audio)
const MAX_TOTAL_SIZE = 50 * MB;  // 50MB total per request (batch uploads)

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  cb(null, true);
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
}).array('file', 20);

/** Middleware to enforce 50MB total for batch uploads. Run after multer. */
export const enforceTotalSizeLimit = (req, res, next) => {
  const files = req.files || [];
  const total = files.reduce((sum, f) => sum + (f.size || 0), 0);
  if (total > MAX_TOTAL_SIZE) {
    return res.status(413).json({
      success: false,
      error: `Total size exceeds 50MB limit. Got ${(total / 1024 / 1024).toFixed(1)}MB.`,
    });
  }
  next();
};

