/**
 * PM2 ecosystem config for NepZo API
 * Use when running without Docker: pm2 start ecosystem.config.cjs
 */
module.exports = {
  apps: [
    {
      name: 'nepzo-api',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: { NODE_ENV: 'production' },
    },
  ],
};
