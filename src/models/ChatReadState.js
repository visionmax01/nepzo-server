import mongoose from 'mongoose';

const { Schema } = mongoose;

const chatReadStateSchema = new Schema(
  {
    chat: {
      type: Schema.Types.ObjectId,
      ref: 'Chat',
      required: true,
      index: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    lastReadAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  { timestamps: true },
);

chatReadStateSchema.index({ chat: 1, user: 1 }, { unique: true });

const ChatReadState = mongoose.model('ChatReadState', chatReadStateSchema);

export { ChatReadState };
