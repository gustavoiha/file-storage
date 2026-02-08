import '@testing-library/jest-dom/vitest';

Object.assign(import.meta.env, {
  VITE_API_BASE_URL: 'https://api.example.com',
  VITE_COGNITO_USER_POOL_ID: 'us-east-1_example',
  VITE_COGNITO_CLIENT_ID: 'exampleclient'
});
