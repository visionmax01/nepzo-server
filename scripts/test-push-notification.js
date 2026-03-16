/**
 * Test script for push notification flow.
 * Run from project root: node server/scripts/test-push-notification.js
 *
 * Requires: Server .env with MONGODB_URI, Firebase service account at server/src/certs/
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import mongoose from 'mongoose';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from server directory
dotenv.config({ path: join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not set. Run from project root with server/.env configured.');
  process.exit(1);
}

async function run() {
  console.log('🧪 Push Notification Test\n');

  try {
    // 1. Connect to MongoDB
    console.log('1. Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('   ✓ Connected\n');

    // 2. Import push notification service (initializes Firebase Admin)
    console.log('2. Loading push notification service...');
    const {
      sendMessageNotification,
      getBadgeCountForUser,
    } = await import('../src/services/pushNotificationService.js');
    const { User } = await import('../src/models/User.js');
    console.log('   ✓ Loaded\n');

    // 3. Find a user with a push token
    console.log('3. Finding user with push token...');
    const userWithToken = await User.findOne(
      { pushToken: { $exists: true, $ne: null, $ne: '' } },
      { _id: 1, name: 1, pushToken: 1 }
    ).lean();

    if (!userWithToken?.pushToken) {
      console.log('   ⚠ No user with push token in database.');
      console.log('   → Log in on the app and complete permission onboarding to register a token.');
      console.log('   → Then run this script again.\n');
      process.exit(0);
    }

    const tokenPreview =
      userWithToken.pushToken.length > 20
        ? `${userWithToken.pushToken.slice(0, 20)}...`
        : userWithToken.pushToken;
    console.log(`   ✓ Found user: ${userWithToken.name} (${userWithToken._id})`);
    console.log(`   Token: ${tokenPreview}\n`);

    // 4. Test badge count
    console.log('4. Testing badge count...');
    const badge = await getBadgeCountForUser(userWithToken._id.toString());
    console.log(`   ✓ Badge count: ${badge}\n`);

    // 5. Send test notification
    console.log('5. Sending test push notification...');
    await sendMessageNotification(
      userWithToken._id.toString(),
      'Test Sender',
      'This is a test message from the verification script.',
      'test-chat-id',
      'text'
    );
    console.log('   ✓ sendMessageNotification completed (check device for notification)\n');

    console.log('✅ All checks passed. Push notification flow is working.\n');
  } catch (err) {
    console.error('\n❌ Test failed:', err.message);
    if (err.code) console.error('   Code:', err.code);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run();
