import mongoose from 'mongoose';

const { Schema } = mongoose;

const friendshipSchema = new Schema(
  {
    user1: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    user2: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

friendshipSchema.index(
  { user1: 1, user2: 1 },
  {
    unique: true,
  },
);

const Friendship = mongoose.model('Friendship', friendshipSchema);

export { Friendship };

