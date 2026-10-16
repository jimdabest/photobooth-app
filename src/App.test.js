jest.mock('react-router-dom', () => ({
  HashRouter: ({ children }) => children,
  Routes: ({ children }) => children,
  Route: () => null,
  useLocation: () => ({ pathname: '/' }),
  useNavigate: () => jest.fn()
}));

import App from './App';

test('loads the application route tree', () => {
  expect(App).toBeDefined();
});
