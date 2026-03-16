import { getActiveCall } from '../services/callService.js';

export const getCurrentCall = async (req, res, next) => {
  try {
    const call = getActiveCall(req.user.id);
    res.json({ success: true, call });
  } catch (err) {
    next(err);
  }
};

