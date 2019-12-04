import { render } from '@testing-library/react';

const WithProviders = ({ children }) => {
  return <>{children}</>;
};

const customRender = (ui, options) =>
  render(ui, { wrapper: WithProviders, ...options });

export * from '@testing-library/react';
export { customRender as render };
