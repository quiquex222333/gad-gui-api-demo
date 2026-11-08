const { test, expect } = require('../src/fixtures');
const config = require('../src/config');

test.describe('Login', () => {
  test('successful login returns an access token', async ({ api }) => {
    const res = await api.login.login(config.GAD_USER, config.GAD_PASSWORD);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.access_token).toBe('string');
    expect(body.access_token.length).toBeGreaterThan(0);
  });

  test('login with wrong password is rejected', async ({ api }) => {
    const res = await api.login.login(config.GAD_USER, 'definitely-wrong');
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.message).toBe('Incorrect email or password');
  });

  test('GET /login validates token: 200 with token, 401 without', async ({ api, authApi }) => {
    expect((await authApi.login.validate()).status()).toBe(200);
    expect((await api.login.validate()).status()).toBe(401);
  });
});
