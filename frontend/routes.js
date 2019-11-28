const nextRoutes = require('next-routes');
const routes = (module.exports = nextRoutes());

const APP_ROUTES = [
  {
    page: 'index',
    pattern: '/',
  },
  {
    page: 'train',
    pattern: '/developers/train',
  },
];

APP_ROUTES.forEach(route => routes.add(route));
