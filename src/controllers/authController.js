import {
  verifyGoogleToken,
  findOrCreateUser,
  generateJwt,
  createUserWithPassword,
  loginWithPassword,
  savePushToken,
} from '../services/authService.js';
import { ValidationError } from '../utils/errorTypes.js';

const serializeUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  connectId: user.connectId,
  avatar: user.avatar,
  status: user.status,
});

export const googleAuth = async (req, res, next) => {
  try {
    const { idToken } = req.body;
    const googleProfile = await verifyGoogleToken(idToken);
    const { user, isNewUser } = await findOrCreateUser(googleProfile);
    const token = generateJwt(user);

    res.json({
      success: true,
      token,
      user: serializeUser(user),
      isNewUser,
    });
  } catch (err) {
    next(err);
  }
};

export const signup = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      throw new ValidationError('Name, email and password are required');
    }
    const user = await createUserWithPassword({ name, email, password });
    const token = generateJwt(user);

    res.status(201).json({
      success: true,
      token,
      user: serializeUser(user),
      isNewUser: true,
    });
  } catch (err) {
    next(err);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      throw new ValidationError('Email and password are required');
    }
    const user = await loginWithPassword({ email, password });
    const token = generateJwt(user);

    res.json({
      success: true,
      token,
      user: serializeUser(user),
    });
  } catch (err) {
    next(err);
  }
};

export const registerPushToken = async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      throw new ValidationError('Push token is required');
    }
    await savePushToken(req.user.id, token);
    console.log('[Push] Token registered for user', req.user.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
