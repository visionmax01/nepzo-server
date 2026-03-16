import mongoose from 'mongoose';
import { encrypt, isEncrypted } from '../services/encryptionService.js';

const { Schema } = mongoose;

const encryptIfNeeded = (val) => {
  if (val == null || val === '') return val;
  if (typeof val !== 'string') return val;
  if (isEncrypted(val)) return val;
  return encrypt(val);
};

const messageSchema = new Schema(
  {
    chat: {
      type: Schema.Types.ObjectId,
      ref: 'Chat',
      required: true,
      index: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    receiver: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    text: {
      type: String,
      set: encryptIfNeeded,
    },
    mediaUrl: {
      type: String,
      set: encryptIfNeeded,
    },
    mediaKey: {
      type: String,
      index: true,
    },
    mediaKeys: {
      type: [String],
      default: undefined,
    },
    messageType: {
      type: String,
      enum: ['text', 'image', 'video', 'audio', 'file'],
      default: 'text',
    },
    audioDuration: {
      type: Number,
      default: null,
    },
    seen: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

messageSchema.pre('save', function () {
  if (this.isModified('text')) {
    const val = this.text;
    if (val != null && val !== '' && typeof val === 'string' && !isEncrypted(val)) {
      this.text = encrypt(val);
    }
  }
  if (this.isModified('mediaUrl')) {
    const val = this.mediaUrl;
    if (val != null && val !== '' && typeof val === 'string' && !isEncrypted(val)) {
      this.mediaUrl = encrypt(val);
    }
  }
});

messageSchema.index({ chat: 1, createdAt: -1 });

const Message = mongoose.model('Message', messageSchema);

export { Message };

