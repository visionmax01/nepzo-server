import mongoose from 'mongoose';
import { generateConnectId } from '../utils/connectIdGenerator.js';

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true,
    },
    googleId: {
      type: String,
      index: true,
    },
    connectId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    passwordHash: {
      type: String,
      select: false,
    },
    avatar: {
      type: String,
    },
    bio: {
      type: String,
      maxlength: 160,
    },
    status: {
      type: String,
      enum: ['online', 'offline', 'busy'],
      default: 'offline',
    },
    lastSeen: {
      type: Date,
      default: null,
    },
    pushToken: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

userSchema.statics.generateUniqueConnectId = async function generateUniqueConnectId() {
  let unique = false;
  let connectId;

  while (!unique) {
    connectId = generateConnectId();
    // eslint-disable-next-line no-await-in-loop
    const exists = await this.exists({ connectId });
    if (!exists) {
      unique = true;
    }
  }

  return connectId;
};

const User = mongoose.model('User', userSchema);

export { User };

