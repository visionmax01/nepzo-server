import mongoose from 'mongoose';

const { Schema } = mongoose;

const callLogSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    peerId: {
      type: String,
      required: true,
      index: true,
    },
    peerName: {
      type: String,
      default: 'Unknown',
    },
    peerAvatar: {
      type: String,
    },
    callType: {
      type: String,
      enum: ['voice', 'video'],
      default: 'voice',
    },
    direction: {
      type: String,
      enum: ['incoming', 'outgoing'],
      default: 'outgoing',
    },
    durationSeconds: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['answered', 'missed', 'cancelled', 'no_answer', 'rejected'],
      default: 'answered',
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

callLogSchema.index({ user: 1, timestamp: -1 });
callLogSchema.index({ user: 1, peerId: 1, timestamp: -1 });

const CallLog = mongoose.model('CallLog', callLogSchema);

export { CallLog };
