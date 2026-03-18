/**
 * PM2 ecosystem config for NepZo API
 * Use when running without Docker: pm2 start ecosystem.config.cjs
 *
 * Auto-restart: autorestart + restart_delay avoid connection loss on crash.
 * Run `pm2 startup` and `pm2 save` once to start on server reboot.
 */
module.exports = {
  apps: [
    {
      name: 'nepzo-api',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      restart_delay: 4000,
      max_restarts: 50,
      min_uptime: '10s',
      watch: false,
      max_memory_restart: '500M',
      env: { NODE_ENV: 'production' },
    },
  ],
};
