import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { AuthError, ValidationError } from '../utils/errorTypes.js';

const googleClient = new OAuth2Client(env.google.clientId);

export const verifyGoogleToken = async (idToken) => {
  if (!idToken) {
    throw new AuthError('Missing Google idToken');
  }

  const audiences = [env.google.clientId];
  if (env.google.androidClientId) {
    audiences.push(env.google.androidClientId);
  }
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: audiences,
  });

  const payload = ticket.getPayload();
  if (!payload || !payload.email) {
    throw new AuthError('Invalid Google token');
  }

  return {
    email: payload.email,
    name: payload.name,
    googleId: payload.sub,
    avatar: payload.picture,
  };
};

export const findOrCreateUser = async ({ email, name, googleId, avatar }) => {
  let user = await User.findOne({ email });
  let isNewUser = false;
  if (!user) {
    const connectId = await User.generateUniqueConnectId();
    user = await User.create({
      email,
      name,
      googleId,
      avatar,
      connectId,
    });
    isNewUser = true;
  }
  return { user, isNewUser };
};

export const createUserWithPassword = async ({ name, email, password }) => {
  const existing = await User.findOne({ email });
  if (existing) {
    throw new ValidationError('Email is already in use');
  }

  const connectId = await User.generateUniqueConnectId();
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await User.create({
    name,
    email,
    connectId,
    passwordHash,
  });

  return user;
};

export const loginWithPassword = async ({ email, password }) => {
  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user || !user.passwordHash) {
    throw new AuthError('Invalid email or password');
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    throw new AuthError('Invalid email or password');
  }

  return user;
};

export const generateJwt = (user) => {
  const payload = {
    sub: user.id,
    email: user.email,
    connectId: user.connectId,
  };

  return jwt.sign(payload, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn,
  });
};

export const savePushToken = async (userId, token) => {
  await User.findByIdAndUpdate(userId, { pushToken: token });
};

