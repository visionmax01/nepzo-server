import { Block } from '../models/Block.js';

export const blockUser = async (req, res) => {
  try {
    const blockerId = req.user.id;
    const blockedId = req.params.userId;
    if (!blockedId || blockedId === blockerId) {
      return res.status(400).json({ success: false, message: 'Invalid user' });
    }
    await Block.findOneAndUpdate(
      { blocker: blockerId, blocked: blockedId },
      {},
      { upsert: true, new: true },
    );
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, message: e?.message || 'Failed to block' });
  }
};

export const unblockUser = async (req, res) => {
  try {
    const blockerId = req.user.id;
    const blockedId = req.params.userId;
    if (!blockedId) {
      return res.status(400).json({ success: false, message: 'Invalid user' });
    }
    await Block.deleteOne({ blocker: blockerId, blocked: blockedId });
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, message: e?.message || 'Failed to unblock' });
  }
};

export const checkBlockStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const otherUserId = req.params.userId;
    if (!otherUserId) {
      return res.status(400).json({ success: false, message: 'Invalid user' });
    }
    const [iBlockedThem, theyBlockedMe] = await Promise.all([
      Block.exists({ blocker: userId, blocked: otherUserId }),
      Block.exists({ blocker: otherUserId, blocked: userId }),
    ]);
    return res.json({
      success: true,
      iBlockedThem: !!iBlockedThem,
      theyBlockedMe: !!theyBlockedMe,
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e?.message || 'Failed to check' });
  }
};
