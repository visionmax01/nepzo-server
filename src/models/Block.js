import mongoose from 'mongoose';

const { Schema } = mongoose;

const blockSchema = new Schema(
  {
    blocker: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    blocked: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

blockSchema.index({ blocker: 1, blocked: 1 }, { unique: true });
blockSchema.index({ blocked: 1 });

const Block = mongoose.model('Block', blockSchema);

export { Block };
